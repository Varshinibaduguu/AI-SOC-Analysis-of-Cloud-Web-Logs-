"""Isolation Forest + rule-based threat detection for security logs."""

import json
import logging
import re
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)

# Rule-based patterns for common SOC threats
THREAT_RULES = [
    {
        "name": "failed_login_burst",
        "pattern": r"(failed|failure|denied).{0,80}(login|auth|sign.?in)",
        "severity": 0.7,
        "description": "Multiple failed authentication attempts detected",
    },
    {
        "name": "privilege_escalation",
        "pattern": r"(privilege|admin|root|sudo|escalat)",
        "severity": 0.85,
        "description": "Potential privilege escalation activity",
    },
    {
        "name": "suspicious_iam",
        "pattern": r"(AssumeRole|CreateUser|AttachUserPolicy|PutUserPolicy)",
        "severity": 0.8,
        "description": "Suspicious IAM activity (CloudTrail pattern)",
    },
    {
        "name": "data_exfiltration",
        "pattern": r"(large.?transfer|exfil|download|s3.?GetObject).{0,60}(unusual|anomal)",
        "severity": 0.75,
        "description": "Potential data exfiltration indicators",
    },
    {
        "name": "malicious_ip",
        "pattern": r"(tor|botnet|blacklist|malicious).{0,40}(ip|address)",
        "severity": 0.9,
        "description": "Communication with potentially malicious IP",
    },
]


def _extract_numeric_features(lines: List[str]) -> np.ndarray:
    """Build feature matrix from log lines for Isolation Forest."""
    features = []
    for line in lines:
        length = len(line)
        error_count = len(re.findall(r"error|fail|denied|unauthorized", line, re.I))
        ip_count = len(re.findall(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", line))
        status_codes = len(re.findall(r"\b[45]\d{2}\b", line))
        features.append([length, error_count, ip_count, status_codes])
    return np.array(features) if features else np.zeros((0, 4))


def run_rule_detection(text: str) -> List[Dict[str, Any]]:
    findings = []
    for rule in THREAT_RULES:
        matches = re.findall(rule["pattern"], text, re.I)
        if matches:
            findings.append({
                "rule": rule["name"],
                "description": rule["description"],
                "severity": rule["severity"],
                "match_count": len(matches),
            })
    return findings


def run_isolation_forest(lines: List[str], contamination: float = 0.1) -> List[Dict[str, Any]]:
    if len(lines) < 10:
        return []

    X = _extract_numeric_features(lines)
    if X.shape[0] < 10:
        return []

    model = IsolationForest(contamination=contamination, random_state=42)
    predictions = model.fit_predict(X)
    scores = model.decision_function(X)

    anomalies = []
    for i, (pred, score) in enumerate(zip(predictions, scores)):
        if pred == -1:
            anomalies.append({
                "line_index": i,
                "anomaly_score": round(float(-score), 4),
                "preview": lines[i][:200],
            })
    return anomalies[:20]


def analyze_logs_content(content: str, log_type: str = "generic") -> Tuple[float, List[Dict], List[str]]:
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    if not lines:
        return 0.0, [], []

    rule_findings = run_rule_detection(content)
    ml_anomalies = run_isolation_forest(lines)

    threats = [f["description"] for f in rule_findings]
    if ml_anomalies:
        threats.append(f"ML detected {len(ml_anomalies)} anomalous log line(s)")

    rule_score = max((f["severity"] for f in rule_findings), default=0.0)
    ml_score = min(len(ml_anomalies) / max(len(lines), 1) * 2, 1.0)
    severity_score = round(min(1.0, 0.6 * rule_score + 0.4 * ml_score + 0.1 * len(threats)), 2)

    combined = {
        "rule_findings": rule_findings,
        "ml_anomalies": ml_anomalies,
        "log_type": log_type,
        "line_count": len(lines),
    }
    return severity_score, [combined], threats
