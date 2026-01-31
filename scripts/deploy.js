const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
  host: '72.62.16.140',
  username: 'bonzo',
  password: 'bonzo@vps', // Hardcoded as requested by user interaction flow
  port: 22,
};

const localFile = path.resolve(__dirname, '../final_release.tar.gz');
const remoteDir = '/home/bonzo/afs_doc_tools';
const remoteFile = '/home/bonzo/final_release.tar.gz';

const conn = new Client();

console.log('🚀 Starting Deployment to ' + config.host);

conn.on('ready', () => {
  console.log('✅ SSH Connection established');

  conn.sftp((err, sftp) => {
    if (err) throw err;

    console.log(`📤 Uploading release.tar.gz (${(fs.statSync(localFile).size / 1024 / 1024).toFixed(2)} MB)...`);
    
    sftp.fastPut(localFile, remoteFile, {
        step: (transferred, chunk, total) => {
            const percent = Math.round((transferred / total) * 100);
            if (percent % 10 === 0) process.stdout.write(`\rUploading: ${percent}%`);
        }
    }, (err) => {
      if (err) throw err;
      console.log('\n✅ Upload successful');

      // Verify file size
      sftp.stat(remoteFile, (err, stats) => {
        if (err) throw err;
        const localSize = fs.statSync(localFile).size;
        console.log(`🔍 Verification: Local=${localSize} bytes, Remote=${stats.size} bytes`);
        
        if (localSize !== stats.size) {
            console.error('❌ File size mismatch! Upload failed.');
            conn.end();
            return;
        }

        console.log('✅ Integrity check passed. Executing remote commands...');
        const commands = [
            `mkdir -p ${remoteDir}`,
            `tar -xzf ${remoteFile} -C ${remoteDir}`,
            `rm ${remoteFile}`, // cleanup zip
            `cd ${remoteDir} && docker compose down`, // Stop existing
            `cd ${remoteDir} && docker compose up -d --build --remove-orphans`, // Rebuild and start
            `cd ${remoteDir} && docker image prune -f` // cleanup images
        ].join(' && ');

        conn.exec(commands, (err, stream) => {
            if (err) throw err;
            stream.on('close', (code, signal) => {
            console.log(`\nDeployment process closed with code: ${code}`);
            conn.end();
            }).on('data', (data) => {
            console.log('STDOUT: ' + data);
            }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
            });
        });
      });
    });
  });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);
