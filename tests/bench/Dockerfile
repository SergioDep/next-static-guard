FROM debian:bookworm-slim AS git
RUN apt-get update && apt-get install -y --no-install-recommends gcc make libc6-dev zlib1g-dev curl ca-certificates xz-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl -fsSL https://www.kernel.org/pub/software/scm/git/git-2.47.0.tar.xz -o git.tar.xz && echo "1ce114da88704271b43e027c51e04d9399f8c88e9ef7542dae7aebae7d87bc4e  git.tar.xz" | sha256sum -c - && tar -xf git.tar.xz
RUN make -C git-2.47.0 -j2 NO_OPENSSL=YesPlease NO_GETTEXT=YesPlease NO_TCLTK=YesPlease NO_CURL=YesPlease NO_EXPAT=YesPlease NO_ICONV=YesPlease prefix=/opt/git all install

FROM node:24.21.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends time ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=git /opt/git /opt/git
ENV PATH="/opt/git/bin:${PATH}"
WORKDIR /work
COPY package.json package-lock.json .npmrc ./
COPY tests/fixtures/guardlab/base/package.json tests/fixtures/guardlab/base/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --ignore-scripts --omit=dev
COPY dist dist
COPY schemas schemas
COPY tests/bench/run.mjs tests/bench/measure.mjs tests/bench/
CMD ["node", "tests/bench/run.mjs"]
