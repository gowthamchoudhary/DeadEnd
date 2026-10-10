from .db import create_all

if __name__ == "__main__":
    create_all()
    print("schema created (incl. pgvector extension + ivfflat index)")
