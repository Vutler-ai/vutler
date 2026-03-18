# Synology Disk Health Check Report

**Date:** 2026-03-17 08:30 AM (Europe/Zurich)  
**Status:** Incomplete due to errors

## Mounted Volumes Status:

### Disk Usage (df -h):  
- **/Volumes/A L**:  
  - Size: 894Gi, Used: 189Gi, Available: 705Gi (22% used)  
- **/**:  
  - Size: 466Gi, Used: 8.7Gi, Available: 384Gi (3% used)  

### Inode Usage (df -i):  
- **/Volumes/A L**:  
  - Used: 0, Free: 0, % Used: 100%
- **/**:  
  - Inodes Used: 356882, Free: 4030292760 (0% used)

## Backup Directory Check:
- Unable to access specified backup directory: **/path/to/your/backup/**.

## I/O Sanity Test:
- Sanity writing to **/tmp/backup_sanity_test.txt**: Test completed successfully.

## Synology Status:
- **SSH connection failed**. 

### Action Required:
1. Confirm network settings for Synology NAS; SSH key verification failed.
2. Verify correct paths for backup directories.
3. Review mount presence for **/mnt/** paths that were not checked. 

## Next Steps:
- Follow up on connectivity to the Synology NAS.
- Update paths as necessary for accurate disk health checks.