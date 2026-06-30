-- Revert 0007: deployer IP returns to SHA-256 hashed storage, so no raw IPs are kept at rest.
-- Rename the column back to deploy_ip_hash and scrub any plaintext IPs collected while plaintext
-- storage was live — a real SHA-256 hash is always 64 hex chars, so anything else is a raw IP.
-- The artifacts_ip_live_idx index follows the rename automatically in Postgres.
alter table artifacts rename column deploy_ip to deploy_ip_hash;
update artifacts set deploy_ip_hash = null where deploy_ip_hash is not null and char_length(deploy_ip_hash) <> 64;
