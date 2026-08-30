from esun_inventory.utils.toon import to_toon


def test_toon_simple_dict():
    data = {"name": "Alice", "age": 30}
    expected = "name: Alice\nage: 30"
    assert to_toon(data) == expected

def test_toon_nested_structure():
    data = {
        "user": {
            "name": "Bob",
            "roles": ["admin", "editor"]
        }
    }
    # Indent 2 spaces for nested
    expected = "user:\n  name: Bob\n  roles:\n    - admin\n    - editor"
    assert to_toon(data) == expected

def test_toon_null_pruning():
    data = {
        "present": "here",
        "missing": None,
        "empty_str": "  ",
        "nan_val": float("nan"),
        "nan_str": "nan"
    }
    # All null-like should be pruned
    assert to_toon(data) == "present: here"

def test_toon_list_of_dicts():
    data = [
        {"id": 1, "val": "a"},
        {"id": 2, "val": "b"}
    ]
    expected = "-\n  id: 1\n  val: a\n-\n  id: 2\n  val: b"
    assert to_toon(data) == expected

def test_toon_deep_nesting():
    data = {"a": {"b": {"c": "d"}}}
    expected = "a:\n  b:\n    c: d"
    assert to_toon(data) == expected

def test_toon_empty_containers():
    # Empty containers are not pruned by default logic unless their elements are pruned
    # But let's check current behavior
    data = {"empty_list": [], "empty_dict": {}}
    # Current implementation:
    # for k, v in data.items(): if _is_null(v): continue ...
    # _is_null only checks None, "", nan. Empty list/dict are NOT null.
    # So they should print the key and then recurse, resulting in just the key line.
    assert "empty_list:" in to_toon(data)


def test_toon_boolean_values():
    data = {"active": True, "deleted": False}
    expected = "active: True\ndeleted: False"
    assert to_toon(data) == expected


def test_toon_negative_and_zero():
    data = {"score": -5, "balance": 0, "note": "test"}
    expected = "score: -5\nbalance: 0\nnote: test"
    assert to_toon(data) == expected


def test_toon_mixed_types():
    data = {"count": 42, "price": 19.99, "flag": True}
    expected = "count: 42\nprice: 19.99\nflag: True"
    assert to_toon(data) == expected
