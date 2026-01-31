# Build the Docker image
Write-Host "Building Docker image..."
docker build -t afs_doc_tools:latest .

# Save the image to a tar file
Write-Host "Saving image to afs_doc_tools.tar..."
docker save -o afs_doc_tools.tar afs_doc_tools:latest

Write-Host "Packaging complete."
Write-Host "To deploy to the remote host:"
Write-Host "1. Copy 'afs_doc_tools.tar' and 'docker-compose.prod.yml' to the remote host."
Write-Host "2. Ensure the 'cloudbeaver_net' network exists and the DB container is named 'afs-postgres'."
Write-Host "3. On the remote host, run:"
Write-Host "   docker load -i afs_doc_tools.tar"
Write-Host "   docker-compose -f docker-compose.prod.yml up -d"
