# Health Check Report

## Score: 60/100

### Issues Found:
1. **Docker API Check**: Failed to connect to the Docker API.
2. **Memory Check**: Command `free -m` not found.
3. **SSH Check**: SSH connection successful.
4. **Disk Usage Check**: Disk usage is at 3%. (OK)
5. **SSL Certificate Expiry Check**: Certificate expires on Jun 9th, 2026. (Next expiry to monitor)
6. **Local API Process Check**: Unable to retrieve logs from the `vutler-api`. 

### Warnings:
- HTTP endpoints requiring auth were not checked due to lack of configuration.