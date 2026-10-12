from datetime import datetime

def session(now, start, end):
    if start <= now <= end:
        return True
    return False
