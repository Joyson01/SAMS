import argparse, os
import uvicorn

def main():
    p=argparse.ArgumentParser(); p.add_argument("--phone",action="store_true"); p.add_argument("--port",type=int,default=8000); args=p.parse_args()
    uvicorn.run("attendance_app.main:app",host="0.0.0.0" if args.phone else "127.0.0.1",port=args.port)
