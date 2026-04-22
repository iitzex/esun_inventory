#!/usr/bin/env python3
"""
安裝 Electron app 到 ~/Applications

流程：
1. 決定專案目錄（--dir / 當前目錄 / 歷史紀錄）
2. 執行 npm start，開啟 Electron 預覽
3. 等待 Electron 進程啟動完成
4. 用 electron-packager 打包
5. 複製 .app 到 ~/Applications
"""

import argparse
import json
import logging
import platform
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def get_process_cwd(pid: int) -> Path | None:
    """取得指定 PID 的工作目錄（macOS 用 lsof）"""
    try:
        result = subprocess.run(
            ["lsof", "-a", "-d", "cwd", "-p", str(pid), "-Fn"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        for line in result.stdout.splitlines():
            if line.startswith("n"):
                return Path(line[1:])
    except Exception as e:
        logger.debug(f"lsof PID {pid} 失敗: {e}")
    return None


def find_electron_project_from_process() -> Path | None:
    """從執行中的進程找到 Electron 專案目錄"""
    result = subprocess.run(["ps", "-eo", "pid,ppid,command"], capture_output=True, text=True)
    lines = result.stdout.splitlines()

    # 找所有 npm 進程 pid
    npm_pids: set[int] = set()
    for line in lines:
        if re.search(r"\bnpm\b", line) and "start" in line:
            parts = line.split(None, 2)
            if parts:
                try:
                    npm_pids.add(int(parts[0]))
                except ValueError:
                    pass

    # 找 electron 進程（直接命令或 node_modules 內的 electron）
    electron_candidates: list[tuple[int, int]] = []  # (pid, ppid)
    for line in lines:
        if re.search(r"\belectron\b", line, re.IGNORECASE) and "grep" not in line:
            parts = line.split(None, 2)
            if len(parts) >= 2:
                try:
                    pid, ppid = int(parts[0]), int(parts[1])
                    electron_candidates.append((pid, ppid))
                except ValueError:
                    pass

    if not electron_candidates:
        logger.warning("找不到執行中的 Electron 進程")
        return None

    # 優先找 ppid 屬於 npm 的 electron 進程
    target_pid: int | None = None
    for pid, ppid in electron_candidates:
        if ppid in npm_pids:
            target_pid = pid
            break

    # 若無直接父子關係，取最新啟動的 electron 進程（PID 最大）
    if target_pid is None:
        target_pid = max(pid for pid, _ in electron_candidates)

    logger.info(f"找到 Electron 進程 PID: {target_pid}")
    cwd = get_process_cwd(target_pid)
    if cwd:
        logger.info(f"Electron 工作目錄: {cwd}")
    return cwd


def find_project_from_history() -> Path | None:
    """從 fish/zsh/bash 歷史紀錄中找最後一次 npm start 的目錄"""
    history_files = [
        Path.home() / ".local/share/fish/fish_history",
        Path.home() / ".zsh_history",
        Path.home() / ".bash_history",
    ]

    for hist_file in history_files:
        if not hist_file.exists():
            continue

        text = hist_file.read_text(errors="replace")

        if "fish_history" in hist_file.name:
            # fish history 格式：cmd: xxx\n  when: timestamp\n  paths:\n    - xxx
            # 找最後一個包含 npm start 的 cmd block
            blocks = re.findall(r"- cmd: (.+?)(?=\n- cmd:|\Z)", text, re.DOTALL)
            for block in reversed(blocks):
                if "npm start" in block:
                    paths = re.findall(r"paths:\s*\n\s*- (.+)", block)
                    if paths:
                        candidate = Path(paths[0].strip())
                        if candidate.is_dir() and (candidate / "package.json").exists():
                            logger.info(f"從 fish history 找到目錄: {candidate}")
                            return candidate
        else:
            # zsh/bash: 找最後一次 npm start 前的 cd 指令
            lines = text.splitlines()
            last_dir: Path | None = None
            for line in lines:
                line = line.strip().lstrip(";0123456789")  # 去掉 zsh extended history prefix
                if line.startswith("cd "):
                    d = Path(line[3:].strip().replace("~", str(Path.home())))
                    if d.is_dir():
                        last_dir = d
                elif "npm start" in line and last_dir:
                    if (last_dir / "package.json").exists():
                        logger.info(f"從 shell history 找到目錄: {last_dir}")
                        return last_dir

    return None


def get_app_meta(cwd: Path) -> tuple[str, str]:
    """從 package.json 取得 app 名稱與版本"""
    pkg_path = cwd / "package.json"
    if pkg_path.exists():
        data = json.loads(pkg_path.read_text())
        name = data.get("productName") or data.get("name") or cwd.name
        version = data.get("version", "1.0.0")
        return name, version
    return cwd.name, "1.0.0"


def detect_arch() -> str:
    """偵測目前 CPU 架構"""
    machine = platform.machine()
    return "arm64" if machine == "arm64" else "x64"


def fix_venv_dylib(cwd: Path) -> None:
    """解決 .venv/bin/python 為 symlink 導致打包後找不到 libpython dylib 的問題。

    electron-packager 打包後 rpath @executable_path/../lib 會指向 .venv/lib/，
    但 uv 管理的 Python 的 dylib 不在此處。
    此函式將真實 binary 與 dylib 就地複製進 .venv，讓打包後能自包含。
    """
    venv_python = cwd / ".venv" / "bin" / "python"
    if not venv_python.exists():
        return

    real_python = venv_python.resolve()
    if real_python == venv_python:
        logger.debug("python 非 symlink，跳過 dylib 修復")
        return

    logger.info(f"偵測到 symlink python → {real_python}，準備修復 dylib...")

    # 找 libpython dylib（位於真實 binary 的 ../lib/）
    dylib_src = real_python.parent.parent / "lib" / "libpython3.13.dylib"
    if not dylib_src.exists():
        # 嘗試 glob 找任意版本
        candidates = list(real_python.parent.parent.glob("lib/libpython*.dylib"))
        if not candidates:
            logger.warning(f"找不到 libpython dylib，跳過修復（查找於 {real_python.parent.parent / 'lib'}）")
            return
        dylib_src = candidates[0]

    dylib_name = dylib_src.name
    venv_lib = cwd / ".venv" / "lib"
    venv_lib.mkdir(exist_ok=True)
    dylib_dst = venv_lib / dylib_name

    if not dylib_dst.exists():
        logger.info(f"複製 {dylib_src.name} → .venv/lib/")
        shutil.copy2(dylib_src, dylib_dst)

    # 將 .venv/bin/python symlink 換成真實 binary（讓 rpath 正確解析）
    venv_bin = cwd / ".venv" / "bin"
    for name in ("python", "python3", f"python{real_python.name.lstrip('python')}"):
        target = venv_bin / name
        if target.is_symlink():
            target.unlink()
            shutil.copy2(real_python, target)
            logger.info(f"替換 symlink → 真實 binary: .venv/bin/{name}")

    logger.info("dylib 修復完成")


def package_app(cwd: Path, app_name: str) -> Path | None:
    """用 electron-packager 打包 Electron app"""
    fix_venv_dylib(cwd)
    arch = detect_arch()
    out_dir = cwd / "dist"
    out_dir.mkdir(exist_ok=True)

    logger.info(f"打包中：{app_name} ({arch})...")

    cmd = [
        "npx",
        "electron-packager",
        str(cwd),
        app_name,
        "--platform=darwin",
        f"--arch={arch}",
        f"--out={out_dir}",
        "--overwrite",
        "--ignore=dist",
        "--ignore=.git",
    ]

    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"打包失敗:\n{result.stderr}")
        return None

    # 找輸出的 .app
    app_files = sorted(out_dir.glob(f"**/{app_name}.app"))
    if not app_files:
        logger.error("找不到打包輸出的 .app 檔案")
        return None

    return app_files[0]


def install_app(src: Path, app_name: str) -> Path:
    """複製 .app 到 ~/Applications"""
    apps_dir = Path.home() / "Applications"
    apps_dir.mkdir(exist_ok=True)
    target = apps_dir / f"{app_name}.app"

    if target.exists():
        logger.info(f"移除舊版本: {target}")
        shutil.rmtree(target)

    logger.info(f"安裝到: {target}")
    shutil.copytree(src, target)
    return target


def launch_electron(cwd: Path) -> subprocess.Popen:
    """背景啟動 npm start，回傳 Popen 物件"""
    logger.info("啟動 Electron (npm start)...")
    return subprocess.Popen(
        ["npm", "start"],
        cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_for_electron(timeout: int = 20) -> bool:
    """輪詢直到 Electron 進程出現，確認 app 已啟動"""
    logger.info("等待 Electron 視窗開啟...")
    for i in range(timeout):
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True)
        if re.search(r"\belectron\b", result.stdout, re.IGNORECASE):
            logger.info(f"Electron 已啟動（{i + 1}s）")
            return True
        time.sleep(1)
    return False


def resolve_project_dir(hint: Path | None) -> Path | None:
    """按優先順序決定專案目錄：--dir > 當前目錄 > 執行中進程 > shell 歷史"""
    if hint:
        return hint.expanduser().resolve()

    # 當前目錄若有 package.json 直接用
    cwd = Path.cwd()
    if (cwd / "package.json").exists():
        return cwd

    # 掃描執行中進程
    found = find_electron_project_from_process()
    if found:
        return found

    # 從 shell 歷史回推
    logger.info("嘗試從 shell 歷史紀錄尋找...")
    return find_project_from_history()


def main():
    parser = argparse.ArgumentParser(description="開啟 Electron 預覽後安裝到 ~/Applications")
    parser.add_argument("--dir", type=Path, help="手動指定專案目錄（預設：當前目錄）")
    parser.add_argument("--no-preview", action="store_true", help="跳過 npm start 預覽，直接打包")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # 1. 決定專案目錄
    project_dir = resolve_project_dir(args.dir)
    if project_dir is None:
        logger.error("無法找到 Electron 專案，請用 --dir 手動指定")
        sys.exit(1)

    pkg_path = project_dir / "package.json"
    if not pkg_path.exists():
        logger.error(f"{project_dir} 缺少 package.json")
        sys.exit(1)

    pkg = json.loads(pkg_path.read_text())
    start_script = pkg.get("scripts", {}).get("start", "")
    if "electron" not in start_script.lower():
        logger.warning(f"start script 不含 electron: {start_script!r}")

    app_name, version = get_app_meta(project_dir)
    logger.info(f"專案：{app_name} v{version}  路徑：{project_dir}")

    # 2. 啟動 Electron 預覽
    electron_proc: subprocess.Popen | None = None
    if not args.no_preview:
        electron_proc = launch_electron(project_dir)
        if not wait_for_electron(timeout=20):
            logger.warning("等待逾時，Electron 可能未成功啟動，仍繼續打包")

    # 3. 打包
    app_path = package_app(project_dir, app_name)
    if app_path is None:
        if electron_proc:
            electron_proc.terminate()
        sys.exit(1)

    # 4. 安裝
    target = install_app(app_path, app_name)

    print(f"\n✓ 安裝完成：{target}")
    if electron_proc and electron_proc.poll() is None:
        print("  (Electron 預覽視窗仍在執行，可手動關閉)")


if __name__ == "__main__":
    main()
