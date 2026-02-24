from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, BIGINT, String, Text, Numeric, DateTime, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from typing import List, Optional
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
node_env = os.getenv("NODE_ENV", "development")
env_file = ".env.production" if node_env == "production" else ".env"

# List of possible locations for the env file
possible_paths = [
    os.path.join(os.path.dirname(__file__), env_file),
    os.path.join(os.path.dirname(__file__), '..', env_file),
    os.path.join(os.getcwd(), env_file)
]

for path in possible_paths:
    if os.path.exists(path):
        load_dotenv(path)
        break

# FastAPI Setup
app = FastAPI(title="Scrappy Data Export API", version="1.0.0")

# CORS Setup (Allow other websites to fetch data)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Setup (Connecting to MariaDB)
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Handle mysql:// or mysql+pymysql:// prefix
    if DATABASE_URL.startswith("mysql://"):
        SQLALCHEMY_DATABASE_URL = DATABASE_URL.replace("mysql://", "mysql+pymysql://")
    elif DATABASE_URL.startswith("mariadb://"):
        SQLALCHEMY_DATABASE_URL = DATABASE_URL.replace("mariadb://", "mysql+pymysql://")
    else:
        SQLALCHEMY_DATABASE_URL = DATABASE_URL
else:
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASS = os.getenv("DB_PASSWORD", "")
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = os.getenv("DB_PORT", "3306")
    DB_NAME = os.getenv("DB_NAME", "scrapper_dev")
    
    if DB_PASS:
        SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    else:
        SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Models matching Prisma schema
class City(Base):
    __tablename__ = "City"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True)

class District(Base):
    __tablename__ = "District"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255))
    cityId = Column(Integer, ForeignKey("City.id"))

class Category(Base):
    __tablename__ = "Category"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True)

class Business(Base):
    __tablename__ = "Business"
    id = Column(BIGINT, primary_key=True, index=True)
    businessId = Column(String(255))
    businessName = Column(String(500))
    rating = Column(Numeric(3, 2))
    reviewCount = Column(Integer)
    address = Column(Text)
    directionLink = Column(Text)
    priceInfo = Column(String(255))
    priceReportedCount = Column(Integer)
    operatingHours = Column(JSON)
    phone = Column(String(50))
    imageUrl = Column(Text)
    images = Column(JSON)
    website = Column(Text)
    reviews = Column(JSON)
    query = Column(String(500))
    timestamp = Column(DateTime)
    categoryId = Column(Integer, ForeignKey("Category.id"))
    districtId = Column(Integer, ForeignKey("District.id"))
    
    category = relationship("Category")
    district = relationship("District")

# DB Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Endpoints
@app.get("/")
def read_root():
    return {"status": "Scrappy Export API is Online", "version": "1.0.0"}

@app.get("/api/v1/export/businesses")
def get_all_businesses(db: Session = Depends(get_db)):
    """Orijinal Python Scraper formatında (PascalCase) verileri export eder."""
    try:
        businesses = db.query(Business).all()
        result = []
        for b in businesses:
            result.append({
                "BusinessId": b.businessId,
                "BusinessName": b.businessName,
                "Rating": float(b.rating) if b.rating else 0.0,
                "ReviewCount": b.reviewCount or 0,
                "Address": b.address or "",
                "DirectionLink": b.directionLink or "",
                "PriceInfo": b.priceInfo or "N/A",
                "PriceReportedCount": b.priceReportedCount or 0,
                "OperatingHours": b.operatingHours or [],
                "Phone": b.phone or "",
                "ImageURL": b.imageUrl or "",
                "Images": b.images or [],
                "Website": b.website or "",
                "Reviews": b.reviews or [],
                "Category": b.category.name if b.category else "N/A",
                "District": b.district.name if b.district else "N/A",
                "Query": b.query or "",
                "Timestamp": b.timestamp.isoformat() if b.timestamp else datetime.now().isoformat()
            })
        return result  # List of objects as requested by common publishing standards
    except Exception as e:
        print(f"Export Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
