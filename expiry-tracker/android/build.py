#!/usr/bin/env python3
"""Build the Expiry Tracker Android app (APK) without Gradle or the Android SDK.

Needs Java 17+ (javac), Python 3.9+ with the `cryptography` package, and internet access to
Maven Central the first time (tools are cached in android/.tools, about 160 MB).

    python3 build.py            # -> build/ExpiryTracker.apk

The signing key is created on the first build in android/signing/. Keep that folder: Android only
installs an update over an existing install if it is signed with the same key.
"""
import hashlib
import os
import shutil
import stat
import struct
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

VERSION_CODE = 1
VERSION_NAME = "1.0"
MIN_SDK = 24      # Android 7.0
TARGET_SDK = 34   # Android 14

HERE = Path(__file__).resolve().parent
WEB = HERE.parent
TOOLS = HERE / ".tools"
BUILD = HERE / "build"
SIGNING = HERE / "signing"
WEB_FILES = ["index.html", "styles.css", "app.js", "shared.js", "sw.js", "manifest.webmanifest", "icons"]

MAVEN = "https://repo1.maven.org/maven2/"
DOWNLOADS = {
    # aapt2 (resource compiler) and the framework resource table, prebuilt inside apktool
    "apktool-lib.jar": ("org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar",
                        "983773879fd89ede2cd938858e3efce2a90ac1123f6a5140e9d949dcf4464e3e"),
    # Java bytecode -> Android dex
    "dalvik-dx.jar": ("com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar",
                      "1e4b645628e3bdb097b5331d669e177ef235a551582a8c646dbe36865e541907"),
    # Android 14 framework classes, to compile against
    "android-all.jar": ("org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar",
                        "6be2218c6a53fe3c57bc22ebdc723edcb7270a8a6f187545708aa5c0ed813977"),
}


def log(msg):
    print(f"==> {msg}", flush=True)


def run(cmd, **kw):
    subprocess.run([str(c) for c in cmd], check=True, **kw)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# ------------------------------------------------------------------------------------ tools

def fetch_tools():
    TOOLS.mkdir(exist_ok=True)
    for name, (path, digest) in DOWNLOADS.items():
        dest = TOOLS / name
        if not dest.exists():
            log(f"downloading {name}")
            tmp = dest.with_suffix(".part")
            with urllib.request.urlopen(MAVEN + path, timeout=600) as r, open(tmp, "wb") as f:
                shutil.copyfileobj(r, f)
            tmp.rename(dest)
        if digest and sha256(dest) != digest:
            dest.unlink()
            sys.exit(f"{name}: checksum mismatch; deleted it, run the build again")
    aapt2 = TOOLS / "aapt2"
    framework = TOOLS / "android-framework.jar"
    if not aapt2.exists() or not framework.exists():
        with zipfile.ZipFile(TOOLS / "apktool-lib.jar") as z:
            aapt2.write_bytes(z.read("prebuilt/linux/aapt2" if sys.platform.startswith("linux") else
                                     "prebuilt/macosx/aapt2" if sys.platform == "darwin" else "prebuilt/windows/aapt2.exe"))
            framework.write_bytes(z.read("prebuilt/android-framework.jar"))
        aapt2.chmod(aapt2.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return aapt2, framework


# ------------------------------------------------------------------------------------ signing key

def load_or_create_key():
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    import datetime

    key_pem, cert_pem = SIGNING / "key.pem", SIGNING / "cert.pem"
    if not key_pem.exists():
        log("creating a signing key in android/signing/ (keep it for future updates)")
        SIGNING.mkdir(exist_ok=True)
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Expiry Tracker")])
        now = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
                .public_key(key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=365 * 40))
                .sign(key, hashes.SHA256()))
        key_pem.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                              serialization.NoEncryption()))
        key_pem.chmod(0o600)
        cert_pem.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key = serialization.load_pem_private_key(key_pem.read_bytes(), password=None)
    cert = x509.load_pem_x509_certificate(cert_pem.read_bytes())
    return key, cert


def sign_v2(apk: bytes, key, cert) -> bytes:
    """APK Signature Scheme v2 (enough on its own for Android 7.0+, i.e. MIN_SDK 24)."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    u32 = lambda n: struct.pack("<I", n)
    u64 = lambda n: struct.pack("<Q", n)
    lp = lambda b: u32(len(b)) + b  # length-prefixed

    eocd = apk.rindex(b"PK\x05\x06")
    cd_size, cd_offset = struct.unpack("<II", apk[eocd + 12:eocd + 20])
    sections = [apk[:cd_offset], apk[cd_offset:cd_offset + cd_size], apk[eocd:]]
    chunk_digests = []
    for section in sections:
        for i in range(0, len(section), 1 << 20):
            chunk = section[i:i + (1 << 20)]
            chunk_digests.append(hashlib.sha256(b"\xa5" + u32(len(chunk)) + chunk).digest())
    digest = hashlib.sha256(b"\x5a" + u32(len(chunk_digests)) + b"".join(chunk_digests)).digest()

    RSA_PKCS1_SHA256 = 0x0103
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    spki = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    signed_data = lp(lp(u32(RSA_PKCS1_SHA256) + lp(digest))) + lp(lp(cert_der)) + lp(b"")
    signature = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed_data) + lp(lp(u32(RSA_PKCS1_SHA256) + lp(signature))) + lp(spki)
    value = lp(lp(signer))

    pair = u64(4 + len(value)) + u32(0x7109871A) + value
    size = len(pair) + 8 + 16
    block = u64(size) + pair + u64(size) + b"APK Sig Block 42"
    new_eocd = apk[eocd:eocd + 16] + u32(cd_offset + len(block)) + apk[eocd + 20:]
    return apk[:cd_offset] + block + apk[cd_offset:cd_offset + cd_size] + new_eocd


# ------------------------------------------------------------------------------------ packaging

def aligned_zip(entries, out_path):
    """Write the APK. Uncompressed entries start on a 4-byte boundary (what zipalign does);
    resources.arsc must be uncompressed for Android 11+."""
    with zipfile.ZipFile(out_path, "w") as z:
        for name, data, compress in entries:
            info = zipfile.ZipInfo(name, date_time=(1981, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            if not compress:
                # alignment extra field (id 0xD935): u16 alignment, then padding
                header_end = z.fp.tell() + 30 + len(name.encode()) + 6
                pad = (-header_end) % 4
                info.extra = struct.pack("<HHH", 0xD935, 2 + pad, 4) + b"\0" * pad
            z.writestr(info, data, compresslevel=9 if compress else None)


def main():
    aapt2, framework = fetch_tools()
    key, cert = load_or_create_key()
    if BUILD.exists():
        shutil.rmtree(BUILD)
    (BUILD / "assets" / "www").mkdir(parents=True)

    log("copying the web app")
    for f in WEB_FILES:
        src = WEB / f
        dst = BUILD / "assets" / "www" / f
        shutil.copytree(src, dst) if src.is_dir() else shutil.copy2(src, dst)

    log("compiling resources (aapt2)")
    run([aapt2, "compile", "--dir", HERE / "res", "-o", BUILD / "res.zip"])
    (BUILD / "gen").mkdir()
    run([aapt2, "link", "-o", BUILD / "base.apk", "-I", framework,
         "--manifest", HERE / "AndroidManifest.xml",
         "--min-sdk-version", MIN_SDK, "--target-sdk-version", TARGET_SDK,
         "--version-code", VERSION_CODE, "--version-name", VERSION_NAME,
         "-A", BUILD / "assets", "--java", BUILD / "gen", BUILD / "res.zip"])

    log("compiling Java")
    sources = sorted(str(p) for p in (HERE / "src").rglob("*.java")) + sorted(str(p) for p in (BUILD / "gen").rglob("*.java"))
    (BUILD / "classes").mkdir()
    run(["javac", "--release", "8", "-Xlint:-options", "-encoding", "UTF-8",
         "-cp", TOOLS / "android-all.jar", "-d", BUILD / "classes", *sources])

    log("converting to Android bytecode (dx)")
    run(["java", "-cp", TOOLS / "dalvik-dx.jar", "com.android.dx.command.Main", "--dex",
         f"--min-sdk-version={MIN_SDK}", f"--output={BUILD / 'classes.dex'}", BUILD / "classes"])

    log("packaging")
    entries = []
    with zipfile.ZipFile(BUILD / "base.apk") as base:
        for info in base.infolist():
            data = base.read(info)
            keep_raw = info.filename == "resources.arsc" or info.compress_type == zipfile.ZIP_STORED
            entries.append((info.filename, data, not keep_raw))
    entries.append(("classes.dex", (BUILD / "classes.dex").read_bytes(), True))
    unsigned = BUILD / "unsigned.apk"
    aligned_zip(entries, unsigned)

    log("signing (APK Signature Scheme v2)")
    out = BUILD / "ExpiryTracker.apk"
    out.write_bytes(sign_v2(unsigned.read_bytes(), key, cert))
    log(f"done: {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
