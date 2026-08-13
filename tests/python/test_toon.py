from esun_inventory.utils.toon import ToonConverter


def test_toon_simple_dict():
    data = {"name": "Alice", "age": 30}
    expected = "name: Alice\nage: 30"
    assert ToonConverter.to_toon(data) == expected

def test_toon_nested_structure():
    data = {
        "user": {
            "name": "Bob",
            "roles": ["admin", "editor"]
        }
    }
    # Indent 2 spaces for nested
    expected = "user:\n  name: Bob\n  roles:\n    - admin\n    - editor"
    assert ToonConverter.to_toon(data) == expected

def test_toon_null_pruning():
    data = {
        "present": "here",
        "missing": None,
        "empty_str": "  ",
        "nan_val": float("nan"),
        "nan_str": "nan"
    }
    # All null-like should be pruned
    assert ToonConverter.to_toon(data) == "present: here"

def test_toon_list_of_dicts():
    data = [
        {"id": 1, "val": "a"},
        {"id": 2, "val": "b"}
    ]
    expected = "-\n  id: 1\n  val: a\n-\n  id: 2\n  val: b"
    assert ToonConverter.to_toon(data) == expected

def test_toon_deep_nesting():
    data = {"a": {"b": {"c": "d"}}}
    expected = "a:\n  b:\n    c: d"
    assert ToonConverter.to_toon(data) == expected

def test_toon_empty_containers():
    # Empty containers are not pruned by default logic unless their elements are pruned
    # But let's check current behavior
    data = {"empty_list": [], "empty_dict": {}}
    # Current implementation:
    # for k, v in data.items(): if _is_null(v): continue ...
    # _is_null only checks None, "", nan. Empty list/dict are NOT null.
    # So they should print the key and then recurse, resulting in just the key line.
    assert "empty_list:" in ToonConverter.to_toon(data)
