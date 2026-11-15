#!/usr/bin/env sh
echo "Open http://$(hostname -I | awk '{print $1}'):8000 on your phone"
exec uv run attendance-app --phone
