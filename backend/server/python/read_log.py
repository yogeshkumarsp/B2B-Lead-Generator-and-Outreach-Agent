import sys
filename = sys.argv[1] if len(sys.argv) > 1 else 'individual_test.txt'
try:
    with open(filename, 'r', encoding='utf-16') as f:
        print(f.read())
except Exception:
    try:
        with open('individual_test.txt', 'r', encoding='utf-8') as f:
            print(f.read())
    except Exception as e:
        print(f"Error reading file: {e}")
