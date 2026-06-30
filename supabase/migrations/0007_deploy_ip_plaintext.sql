-- The deployer IP is now stored in plain text instead of a SHA-256 hash. Rename the column to
-- match its new contents and drop the legacy hash values (64-char hex, never a real IP) so the
-- column doesn't mix hashes and IPs. The artifacts_ip_live_idx index follows the rename in Postgres.
alter table artifacts rename column deploy_ip_hash to deploy_ip;
update artifacts set deploy_ip = null where deploy_ip is not null and char_length(deploy_ip) = 64;
