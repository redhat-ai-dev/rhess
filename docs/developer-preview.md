# Developer Preview Release Notes

RHESS is currently in **Developer Preview**. The following known limitations and constraints apply.

## SQLite — Single-Replica Constraint

RHESS uses SQLite (`better-sqlite3`) as its catalog database in the Developer Preview. SQLite is embedded in the server process and stores the database file on the local filesystem (or a PVC in Kubernetes).

**Implications:**

- **Single replica only.** You must deploy exactly one replica (`replicas: 1`). Running multiple replicas against the same PVC will cause database corruption. Horizontal pod autoscaling (HPA) must not be configured.
- **No zero-downtime rolling updates.** Because only one replica can hold the SQLite write lock, rolling update strategy (`RollingUpdate`) must not be used. Use `Recreate` if you need to update the Deployment.
- **PVC access mode must be `ReadWriteOnce`.** The PVC backing the SQLite file must be `ReadWriteOnce` — only one node can mount it at a time.

The storage layer is abstracted behind a `SkillRepository`/`SourceRepository` interface. A PostgreSQL migration is planned for post-Developer Preview to enable multi-replica deployments and horizontal scaling.

## Manual Skill Source Sync

The Developer Preview does not include automatic or scheduled re-sync of skill sources. Skill catalogs become stale as source repositories are updated. Administrators must manually trigger re-sync via:

```bash
curl -X POST http://<rhess-host>/api/v1/sources/<source-id>/sync \
  -H "Authorization: Bearer <admin-token>"
```

Scheduled re-sync is planned for a post-DP release.

## Supported Deployment Configurations

| Configuration | Supported |
|---|---|
| Single replica on OpenShift/Kubernetes | ✓ |
| Local via `podman run` or `docker run` | ✓ |
| Local dev via `npm run dev` | ✓ |
| Multi-replica / HPA | ✗ (SQLite single-writer) |
| Zero-downtime rolling updates | ✗ (SQLite single-writer) |
| Air-gapped deployment | ✗ (requires Git access to skill source repos) |

## Other Known Limitations

- **Per-skill deletion is not supported.** Deletion operates at the source level — removing a source removes all of its associated skills.
- **No skill versioning.** The catalog reflects the latest state of the source repository at the time of the last sync.
- **No SSO/OIDC/LDAP.** Authentication is via a single admin API token (`RHESS_ADMIN_TOKEN`). All read operations are unauthenticated.
- **No automated security audit.** Integration with third-party skill security scanning tools (Gen Agent Trust Hub, Socket, etc.) is out of scope for DP.
