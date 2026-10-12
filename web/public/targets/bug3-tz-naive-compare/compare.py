from datetime import datetime

def overlaps(start_a, end_a, start_b, end_b):
    return start_a < end_b and start_b < end_a
