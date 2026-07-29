#!/usr/bin/env bash
#
# Braino Games — deploy on a docker host.
#
# Fetches the project from GitHub and brings the container up. Idempotent:
# the first run clones, every run after that fast-forwards and rebuilds.
#
#   curl -fsSL https://raw.githubusercontent.com/grandted/braino-games/main/deploy.sh | bash
#
# or, from an existing checkout, ./deploy.sh
#
# Settings, all optional, all overridable from the environment:
#   BRAINO_DIR     where the checkout lives   (default ~/braino-games)
#   BRAINO_BRANCH  branch to deploy           (default main)
#   BRAINO_REPO    clone URL                  (default the public GitHub repo)
#
# Everything server-local — bind address, port, whether to trust a proxy —
# lives in .env next to the compose file. See .env.example.
#
# The whole body is one { } block on purpose: bash reads a script in chunks
# as it runs, and this script git-resets the directory it may itself live in.
# Wrapping it forces bash to parse the lot before executing any of it.
{
  set -euo pipefail

  REPO="${BRAINO_REPO:-https://github.com/grandted/braino-games.git}"
  BRANCH="${BRAINO_BRANCH:-main}"
  APP_DIR="${BRAINO_DIR:-$HOME/braino-games}"
  CONTAINER=braino-games

  log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
  warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
  die() { printf '\033[1;31mdeploy failed:\033[0m %s\n' "$*" >&2; exit 1; }

  # ------------------------------------------------------------ preflight --
  command -v git >/dev/null 2>&1 || die "git is not installed"
  command -v docker >/dev/null 2>&1 || die "docker is not installed"
  docker compose version >/dev/null 2>&1 ||
    die "the docker compose v2 plugin is missing (docker-compose v1 will not do)"
  docker info >/dev/null 2>&1 ||
    die "cannot reach the docker daemon — is it running, and is $USER in the docker group?"

  # ------------------------------------------------------------- checkout --
  if [ -d "$APP_DIR/.git" ]; then
    log "updating $APP_DIR"
    git -C "$APP_DIR" remote set-url origin "$REPO"
    git -C "$APP_DIR" fetch --prune origin "$BRANCH"
    # Tracked files only. data/ and .env are ignored, so they survive this.
    # Never `git clean -xdf` here — it would take the leaderboard with it.
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"
  else
    log "cloning $REPO into $APP_DIR"
    git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
  fi

  cd "$APP_DIR"
  log "at $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

  # --------------------------------------------------------------- config --
  # First run writes .env from the example and stops, because the defaults
  # bind to loopback — deploying them behind an off-box proxy would build for
  # several minutes and then be unreachable.
  if [ ! -f .env ]; then
    cp .env.example .env
    log "wrote .env from .env.example"
    printf '\n  Edit %s/.env, then run this again.\n\n' "$APP_DIR"
    printf '  Behind a proxy on another machine, you want:\n'
    printf '    BRAINO_BIND=0.0.0.0\n'
    printf '    TANGENT_TRUST_PROXY=1\n\n'
    exit 0
  fi

  # ------------------------------------------------------------- database --
  # The container runs as uid 1000 (node). A bind mount keeps the host's
  # ownership, so if the deploy user is not 1000 sqlite cannot write.
  mkdir -p data
  owner=$(stat -c '%u' data)
  if [ "$owner" != "1000" ]; then
    if [ "$(id -u)" = "0" ]; then
      chown -R 1000:1000 data
      log "data/ chowned to uid 1000"
    else
      die "data/ is owned by uid $owner but the container writes as uid 1000.
       Run: sudo chown -R 1000:1000 '$APP_DIR/data'   then deploy again."
    fi
  fi

  # --------------------------------------------------------------- deploy --
  log "building the image"
  docker compose build

  # --force-recreate on purpose: a container left behind by a failed start
  # can come back up with its port publish missing — healthy inside, and
  # unreachable from the host. Recreating costs a second and rules that out.
  log "starting the container"
  docker compose up -d --force-recreate

  # --------------------------------------------------------------- verify --
  log "waiting for the healthcheck"
  status=starting
  for _ in $(seq 1 60); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)
    case "$status" in healthy | unhealthy | missing) break ;; esac
    sleep 1
  done

  if [ "$status" != "healthy" ]; then
    printf '\n'
    docker compose logs --tail 40 || true
    die "container is '$status' after 60s — logs above"
  fi

  published=$(docker compose port braino 8787 2>/dev/null || echo "not published")
  log "healthy, serving on $published"

  # Repeated --build leaves the previous image untagged; without this the
  # disk fills a layer at a time. Dangling images only — nothing referenced
  # by another stack on this host is touched.
  pruned=$(docker image prune -f 2>/dev/null | tail -1 || true)
  [ -n "$pruned" ] && log "$pruned"

  printf '\n\033[1;32mdeployed\033[0m — point the proxy host at this machine on port %s (http)\n' \
    "$(sed -n 's/^BRAINO_PORT=//p' .env | tail -1 || echo 8787)"

  if grep -qE '^TANGENT_TRUST_PROXY=1' .env && grep -qE '^BRAINO_BIND=0\.0\.0\.0' .env; then
    warn "the port is open to the network and x-forwarded-for is trusted.
         Anything that reaches it without passing the proxy can spoof its
         address past the rate limit — firewall the port to the proxy host."
  fi
}
