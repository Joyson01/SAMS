#!/usr/bin/env sh
set -eu
: "${TEACHER_PIN:?Set a non-default TEACHER_PIN before phone mode}"
[ "$TEACHER_PIN" != "1234" ] || { echo "Refusing phone mode with default PIN"; exit 1; }
echo "Open http://$(hostname -I | awk '{print $1}'):8000 on your phone"
exec uv run attendance-app --phone
