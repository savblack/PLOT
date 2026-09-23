# Cloud Agent base image. Cursor checks out the requested revision separately,
# so this file installs only OS packages and pinned toolchains — not the repo.
#
# Pins Node to the same 22.17.1 CI uses (.circleci/config.yml). Playwright OS
# libraries are installed later by `playwright install --with-deps` in
# scripts/cloud-agent-install.sh so they track @playwright/test.

FROM node:22.17.1-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PATH="/usr/lib/postgresql/17/bin:/usr/local/bin:${PATH}"

# policy-rc.d 101 stops postgresql-17's postinst from trying to start a
# cluster during the image build (we only need the binaries; db:migration-test
# creates its own throwaway cluster at runtime).
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d \
    && chmod +x /usr/sbin/policy-rc.d \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        gnupg \
        python3 \
        sudo \
        wget \
    && wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-17 \
        postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/*

# Deno 2.9.5 matches CircleCI's edge:check pin.
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s v2.9.5

RUN corepack enable \
    && corepack prepare pnpm@10.6.3 --activate

# Cloud Agent VMs historically run as ubuntu. Keep that name so snapshot/user
# config stays stable if we ever switch base images.
RUN useradd --create-home --shell /bin/bash ubuntu \
    && echo 'ubuntu ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu
WORKDIR /home/ubuntu

RUN printf '%s\n' \
      'export PATH="/usr/lib/postgresql/17/bin:/usr/local/bin:$PATH"' \
      >> /home/ubuntu/.bashrc
