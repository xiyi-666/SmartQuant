import os

from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()


class Config:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./quant.db")
    # 安全检查：数据库文件不应放在 web 可访问目录
    if DATABASE_URL.startswith("sqlite:///") and not DATABASE_URL.startswith(
        "sqlite:////"
    ):
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if db_path.startswith("./"):
            db_path = os.path.abspath(db_path)
        if "/static/" in db_path or "/public/" in db_path:
            import warnings

            warnings.warn(
                f"[SECURITY] Database file may be in a web-accessible path: {db_path}"
            )
    REDIS_URL = os.getenv("REDIS_URL")
    SECRET_KEY = os.getenv("SECRET_KEY", "quartsys-dev-secret-key")
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7))
    )

    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

    if "HTTP_PROXY" in os.environ:
        del os.environ["HTTP_PROXY"]
    if "HTTPS_PROXY" in os.environ:
        del os.environ["HTTPS_PROXY"]


settings = Config()
