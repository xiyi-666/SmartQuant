#!/usr/bin/env python3
"""Small dependency-free HTTP load probe for safe QuartSys endpoints."""

from __future__ import annotations

import argparse
import json
import socket
import statistics
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


@dataclass
class RequestResult:
    elapsed_ms: float
    status: int | None
    error: str | None = None


def _request_once(url: str, timeout: float, headers: dict[str, str]) -> RequestResult:
    started = time.perf_counter()
    request = Request(url, method="GET", headers=headers)
    try:
        with urlopen(request, timeout=timeout) as response:
            response.read(128)
            status = int(response.status)
            error = None if 200 <= status < 400 else f"http_{status}"
    except HTTPError as exc:
        status = int(exc.code)
        error = f"http_{status}"
    except (TimeoutError, socket.timeout):
        status = None
        error = "timeout"
    except URLError as exc:
        status = None
        reason = getattr(exc, "reason", exc)
        error = f"network:{reason}"
    except Exception as exc:  # A single request must never stop the run.
        status = None
        error = f"error:{type(exc).__name__}"
    return RequestResult(
        elapsed_ms=(time.perf_counter() - started) * 1000.0,
        status=status,
        error=error,
    )


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _headers(args: argparse.Namespace) -> dict[str, str]:
    result = {"User-Agent": "QuartSys-load-test/1.0"}
    if args.token:
        result["Authorization"] = f"Bearer {args.token}"
    for raw in args.header:
        name, separator, value = raw.partition(":")
        if not separator or not name.strip():
            raise ValueError(f"invalid header: {raw!r}; use Name: value")
        result[name.strip()] = value.strip()
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Probe a safe GET endpoint with bounded concurrency."
    )
    parser.add_argument(
        "--url",
    default="http://127.0.0.1:18427/api/health/live",
        help="GET URL; defaults to the unauthenticated liveness endpoint",
    )
    parser.add_argument("--requests", type=int, default=1000, dest="request_count")
    parser.add_argument("--concurrency", type=int, default=200)
    parser.add_argument(
        "--rps",
        type=float,
        default=200.0,
        help="submission rate; use 0 to submit as fast as possible",
    )
    parser.add_argument("--timeout", type=float, default=5.0)
    parser.add_argument("--token", default="", help="optional bearer token")
    parser.add_argument(
        "--header",
        action="append",
        default=[],
        help="additional request header, repeatable: 'Name: value'",
    )
    parser.add_argument(
        "--allow-non-health",
        action="store_true",
        help="allow a URL other than /api/health/live; use only for read-only probes",
    )
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument(
        "--fail-on-errors",
        action="store_true",
        help="return exit code 1 when any request fails",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    parsed = urlparse(args.url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        print("URL must include http:// or https:// and a host", file=sys.stderr)
        return 2
    if not args.allow_non_health and not parsed.path.rstrip("/").endswith(
        "/api/health/live"
    ):
        print(
            "Refusing non-health URL. Add --allow-non-health only for a safe read-only endpoint.",
            file=sys.stderr,
        )
        return 2
    if args.request_count < 1 or args.concurrency < 1 or args.timeout <= 0 or args.rps < 0:
        print("requests, concurrency and timeout must be positive; rps cannot be negative", file=sys.stderr)
        return 2
    try:
        headers = _headers(args)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    started = time.perf_counter()
    futures = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        next_submission = time.perf_counter()
        interval = 1.0 / args.rps if args.rps > 0 else 0.0
        for _ in range(args.request_count):
            now = time.perf_counter()
            if next_submission > now:
                time.sleep(next_submission - now)
            futures.append(executor.submit(_request_once, args.url, args.timeout, headers))
            if interval:
                next_submission += interval
        results = [future.result() for future in as_completed(futures)]
    elapsed_s = max(time.perf_counter() - started, 0.000001)

    latencies = [item.elapsed_ms for item in results]
    errors = Counter(item.error for item in results if item.error)
    statuses = Counter(str(item.status) for item in results if item.status is not None)
    failed = sum(errors.values())
    summary = {
        "url": args.url,
        "requests": len(results),
        "concurrency": args.concurrency,
        "target_rps": args.rps,
        "elapsed_seconds": round(elapsed_s, 3),
        "achieved_rps": round(len(results) / elapsed_s, 2),
        "success_count": len(results) - failed,
        "error_count": failed,
        "error_rate": round(failed / len(results), 6) if results else 1.0,
        "status_counts": dict(statuses),
        "errors": dict(errors),
        "latency_ms": {
            "min": round(min(latencies), 2) if latencies else None,
            "mean": round(statistics.fmean(latencies), 2) if latencies else None,
            "p50": round(_percentile(latencies, 0.50), 2) if latencies else None,
            "p95": round(_percentile(latencies, 0.95), 2) if latencies else None,
            "p99": round(_percentile(latencies, 0.99), 2) if latencies else None,
            "max": round(max(latencies), 2) if latencies else None,
        },
    }
    if args.json_output:
        print(json.dumps(summary, ensure_ascii=True, indent=2))
    else:
        print(f"URL: {summary['url']}")
        print(
            f"Requests: {summary['requests']} | concurrency: {summary['concurrency']} | "
            f"elapsed: {summary['elapsed_seconds']}s | achieved: {summary['achieved_rps']} RPS"
        )
        print(
            f"Success: {summary['success_count']} | errors: {summary['error_count']} "
            f"({summary['error_rate']:.2%})"
        )
        print(f"Status: {summary['status_counts'] or '-'}")
        print(f"Errors: {summary['errors'] or '-'}")
        print(f"Latency ms: {summary['latency_ms']}")
    return 1 if args.fail_on_errors and failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
