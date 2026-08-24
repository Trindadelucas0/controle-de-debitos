#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dashboard_data import rebuild_dashboard

rebuild_dashboard(only_competencias=["07-2026", "08-2026"])
