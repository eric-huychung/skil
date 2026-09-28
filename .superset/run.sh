#!/usr/bin/env bash
set -e
trap 'kill 0' EXIT

npm run gui:dev &
npm run web:dev &
wait
