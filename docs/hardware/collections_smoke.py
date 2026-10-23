# Collections smoke test for the tuple / dict / set toolboxes.
# Copy this file to the board as main.py (or paste it into the REPL) and reset.
# It only uses built-in collections; no wiring, network, files or extra drivers.
#
# Run on ESP32-S3, ESP32-WROOM or ESP8266-ESP12E with MicroPython v1.29.0.
# If the firmware was built without `set`, the set checks are reported as SKIP
# and the set toolbox category should be removed for that board.

import os
import sys

passed = 0
failed = 0
skipped = 0


def ok(name, detail=""):
    global passed
    passed += 1
    print("PASS", name, detail)


def fail(name, detail=""):
    global failed
    failed += 1
    print("FAIL", name, detail)


def skip(name, detail=""):
    global skipped
    skipped += 1
    print("SKIP", name, detail)


def check(name, function):
    try:
        ok(name, function())
    except Exception as error:
        fail(name, repr(error))


def test_tuple_index():
    value = (10, 20, 30)
    assert value[0] == 10
    assert value[-1] == 30
    assert len(value) == 3
    return "index/len"


def test_tuple_slice():
    value = (10, 20, 30, 40)
    assert value[1:] == (20, 30, 40)
    assert value[:2] == (10, 20)
    assert value[1:3] == (20, 30)
    return "slice step=1"


def test_tuple_query():
    value = (1, 2, 1, 3)
    assert value.count(1) == 2
    assert value.index(3) == 3
    assert 2 in value
    return "count/index/in"


def test_tuple_combine_unpack():
    assert (1, 2) + (3, 4) == (1, 2, 3, 4)
    assert (1, 2) * 2 == (1, 2, 1, 2)
    first, second, third = (10, 20, 30)
    assert first == 10 and second == 20 and third == 30
    head, *rest = (1, 2, 3, 4)
    assert head == 1 and rest == [2, 3, 4]
    return "concat/repeat/unpack"


def test_dict_read():
    value = {"name": "Ada", "lang": "Python"}
    assert value.get("name") == "Ada"
    assert value.get("missing") is None
    assert value.get("missing", "fallback") == "fallback"
    assert "name" in value
    assert "missing" not in value
    return "get/in"


def test_dict_modify():
    value = {"name": "Ada"}
    value["year"] = 1843
    assert value["year"] == 1843
    value["year"] = 1844
    assert value["year"] == 1844
    value.pop("year", None)
    value.pop("absent", None)
    assert "year" not in value
    del value["name"]
    assert value == {}
    return "set/pop/del"


def test_dict_views():
    value = {"name": "Ada", "lang": "Python"}
    keys = list(value.keys())
    values = list(value.values())
    items = list(value.items())
    assert len(keys) == 2 and "name" in keys
    assert len(values) == 2 and "Ada" in values
    assert len(items) == 2 and ("name", "Ada") in items
    pairs = []
    for key, item in value.items():
        pairs.append((key, item))
    assert len(pairs) == 2
    return "keys/values/items/for"


def test_dict_create():
    from_keys = dict.fromkeys(["x", "y"], 0)
    assert from_keys == {"x": 0, "y": 0}
    from_pairs = dict(zip(["a", "b"], [1, 2]))
    assert from_pairs == {"a": 1, "b": 2}
    return "fromkeys/zip"


def test_set_create_modify():
    value = {1, 2, 3}
    assert len(value) == 3
    value.add(4)
    assert 4 in value
    value.discard(2)
    value.discard(99)
    assert 2 not in value
    value.remove(3)
    assert 3 not in value
    value.update({5, 6})
    assert 5 in value and 6 in value
    return "add/discard/remove/update"


def test_set_operations():
    left = {1, 2, 3}
    right = {3, 4}
    assert left.union(right) == {1, 2, 3, 4}
    assert left.intersection(right) == {3}
    assert left.difference(right) == {1, 2}
    assert left.symmetric_difference(right) == {1, 2, 4}
    assert {1, 2}.issubset({1, 2, 3})
    assert {1, 2, 3}.issuperset({1, 2})
    assert {1, 2}.isdisjoint({3, 4})
    return "union/intersection/difference/relations"


def test_set_in_place():
    value = {1, 2, 3, 4}
    value.intersection_update({2, 3, 9})
    assert value == {2, 3}
    value.difference_update({2})
    assert value == {3}
    value.symmetric_difference_update({3, 4})
    assert value == {4}
    return "intersection/difference/symmetric_update"


def has_set():
    try:
        set([1])
        return True
    except NameError:
        return False


def main():
    print("Collections smoke test")
    print("platform:", sys.platform)
    try:
        print("uname:", os.uname())
    except Exception as error:
        print("uname unavailable:", repr(error))

    check("tuple index/len", test_tuple_index)
    check("tuple slice", test_tuple_slice)
    check("tuple query", test_tuple_query)
    check("tuple combine/unpack", test_tuple_combine_unpack)
    check("dict read", test_dict_read)
    check("dict modify", test_dict_modify)
    check("dict views", test_dict_views)
    check("dict create", test_dict_create)

    if has_set():
        check("set create/modify", test_set_create_modify)
        check("set operations", test_set_operations)
        check("set in-place", test_set_in_place)
    else:
        skip("set checks", "builtins set not available")

    total = passed + failed
    print("COLLECTIONS RESULT:", str(passed) + "/" + str(total), "checks passed")
    if skipped:
        print("COLLECTIONS SKIPPED:", skipped)
    if failed == 0:
        print("COLLECTIONS OK")


main()
