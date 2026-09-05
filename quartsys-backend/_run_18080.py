import os
import uvicorn
import main

os.environ["DATABASE_URL"] = "sqlite:///./quart.db"
uvicorn.run(main.app, host="127.0.0.1", port=18080)
