#!/bin/bash

# Example Health Check Script

# Check SSH Reachability
ssh -q -o "BatchMode=yes" user@your-vps-ip exit
# Check Docker/Container Status
docker ps
# Check Disk Usage
df -h
# Check Memory
free -h
# Check SSL Expiry
openssl s_client -connect your-domain:443 -servername your-domain < /dev/null 2> /dev/null | openssl x509 -noout -dates
# Check DB Connectivity
db_check_command_here
# Check Backup Mount Presence
ls /backup/mountpoint