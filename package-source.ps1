$exclude = @("node_modules", "dist", ".git", "*.tar", "*.zip", "server_log.txt", "server.log")
$files = Get-ChildItem -Path . -Exclude $exclude

Write-Host "Creating source archive afs_doc_tools_source.zip..."
Compress-Archive -Path $files -DestinationPath afs_doc_tools_source.zip -Force

Write-Host "Archive created successfully."
Write-Host "To deploy to the remote host:"
Write-Host "1. Copy 'afs_doc_tools_source.zip' to the remote host."
Write-Host "2. On the remote host, unzip the archive:"
Write-Host "   unzip afs_doc_tools_source.zip -d afs_doc_tools"
Write-Host "   cd afs_doc_tools"
Write-Host "3. Ensure the 'cloudbeaver_net' network exists and the DB container is named 'afs-postgres'."
Write-Host "4. Build and start the application:"
Write-Host "   docker-compose -f docker-compose.prod.yml up -d --build"
