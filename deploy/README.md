# Deploying https://mcp.chatpush.ru

Pushing a tag `vX.Y.Z` runs `release.yml` (npm, GitHub release, MCP Registry), then `deploy.yml`,
which connects over SSH and runs `chatpush-mcp-deploy deploy vX.Y.Z` on the server. The script:

1. fetches the tag and checks that it is on `main`;
2. builds `chatpush-mcp-server:X.Y.Z` from the Dockerfile (skipped if the image already exists);
3. replaces the `chatpush-mcp` container, same flags as before, same `/etc/chatpush-mcp.env`;
4. waits until `/healthz` reports X.Y.Z, otherwise starts the previous image again and fails;
5. keeps the last 3 images, so a rollback does not need a rebuild.

`deploy.yml` then checks that `https://mcp.chatpush.ru/` reports the new version.

**Redeploy or roll back:** Actions → Deploy → Run workflow (branch `main`), enter the tag, e.g. `v1.1.0`.

## One-time setup

**Server** (root):

```sh
install -o root -g root -m 755 /home/deploy/mcp-chatpush/deploy/chatpush-mcp-deploy /usr/local/bin/chatpush-mcp-deploy
```

In `/home/deploy/.ssh/authorized_keys` the deploy key is restricted to that one command:

```
command="/usr/local/bin/chatpush-mcp-deploy",restrict ssh-ed25519 AAAA... github-actions-deploy mcp.chatpush.ru
```

The script is root-owned and outside the git checkout: the key can only start it, and a deploy can't
rewrite it. After changing `deploy/chatpush-mcp-deploy` in the repo, run the `install` line again.

**GitHub** (repository admin): Settings → Environments → New environment `production`:

- Deployment branches and tags: selected — tag `v*` and branch `main` (for the manual Run workflow).
- Optional: Required reviewers, if every deploy should wait for an approval.
- Environment secret `DEPLOY_SSH_KEY`: the private key matching the public key above.

If the host key of the server changes, update `DEPLOY_KNOWN_HOSTS` in `deploy.yml` (`ssh-keyscan mcp.chatpush.ru`).
