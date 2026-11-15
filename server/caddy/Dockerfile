# Caddy with DNS-provider plugins, so it can obtain a Let's Encrypt certificate
# for a hostname on the home network without opening any router ports.
FROM caddy:2-builder AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/caddy-dns/porkbun

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
