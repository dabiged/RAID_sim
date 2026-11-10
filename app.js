// Main Application Logic

class RAIDSimulator {
    constructor() {
        this.currentRAID = new RAIDConfig('0');
        this.drives = [];
        this.failedDrives = [];
        this.rebuildingDrive = null;
        this.rebuildProgress = 0;
        this.rebuildInterval = null;
        this.isDegraded = false;
        this.isRebuilding = false;

        // Advanced settings
        this.settings = {
            ioPattern: 'random',
            blockSize: 64,
            readWriteRatio: 70,
            stripeSize: 128,
            cacheSize: 512,
            cachePolicy: 'write-back',
            bbuEnabled: true,
            hotSpares: 0
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateRAIDLevel('0');
    }

    setupEventListeners() {
        // RAID level buttons
        document.querySelectorAll('.raid-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const level = e.target.getAttribute('data-raid');
                this.updateRAIDLevel(level);
            });
        });

        // Control buttons
        document.getElementById('write-btn').addEventListener('click', () => this.performOperation('write'));
        document.getElementById('read-btn').addEventListener('click', () => this.performOperation('read'));
        document.getElementById('fail-btn').addEventListener('click', () => this.failRandomDrive());
        document.getElementById('rebuild-btn').addEventListener('click', () => this.startRebuild());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetArray());

        // Advanced settings toggle
        document.getElementById('toggle-advanced').addEventListener('click', () => {
            const panel = document.getElementById('advanced-panel');
            const btn = document.getElementById('toggle-advanced');
            panel.classList.toggle('hidden');
            btn.textContent = panel.classList.contains('hidden')
                ? 'Show Advanced Settings'
                : 'Hide Advanced Settings';
        });

        // I/O Pattern
        document.querySelectorAll('input[name="io-pattern"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.settings.ioPattern = e.target.value;
                this.updatePerformanceImpact();
            });
        });

        // Block Size
        document.getElementById('block-size').addEventListener('change', (e) => {
            this.settings.blockSize = parseInt(e.target.value);
            this.updatePerformanceImpact();
        });

        // Read/Write Ratio
        document.getElementById('rw-ratio').addEventListener('input', (e) => {
            this.settings.readWriteRatio = parseInt(e.target.value);
            document.getElementById('read-percent').textContent = `${e.target.value}% Read`;
            document.getElementById('write-percent').textContent = `${100 - e.target.value}% Write`;
            this.updatePerformanceImpact();
        });

        // Stripe Size
        document.getElementById('stripe-size').addEventListener('change', (e) => {
            this.settings.stripeSize = parseInt(e.target.value);
            this.updatePerformanceImpact();
        });

        // Cache Size
        document.getElementById('cache-size').addEventListener('change', (e) => {
            this.settings.cacheSize = parseInt(e.target.value);
            this.updatePerformanceImpact();
        });

        // Cache Policy
        document.getElementById('cache-policy').addEventListener('change', (e) => {
            this.settings.cachePolicy = e.target.value;
            this.updatePerformanceImpact();
        });

        // BBU
        document.getElementById('bbu-enabled').addEventListener('change', (e) => {
            this.settings.bbuEnabled = e.target.checked;
            this.updatePerformanceImpact();
        });

        // Hot Spare
        document.getElementById('hot-spare').addEventListener('change', (e) => {
            this.settings.hotSpares = parseInt(e.target.value);
            this.updatePerformanceImpact();
        });

        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const preset = e.target.getAttribute('data-preset');
                this.applyPreset(preset);
            });
        });
    }

    updateRAIDLevel(level) {
        // Update active button
        document.querySelectorAll('.raid-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-raid') === level) {
                btn.classList.add('active');
            }
        });

        // Create new RAID config
        this.currentRAID = new RAIDConfig(level);
        this.resetArray();

        // Update info
        this.updateRAIDInfo();
        this.updateDescription();
        this.renderDrives();
        this.updatePerformanceImpact();
    }

    updateRAIDInfo() {
        const config = this.currentRAID.calculateArrayConfig();

        document.getElementById('raid-type').textContent = config.name;
        document.getElementById('total-drives').textContent = config.totalDrives;
        document.getElementById('usable-capacity').textContent = `${config.usableCapacity}TB`;
        document.getElementById('raw-capacity').textContent = `${config.rawCapacity}TB`;
        document.getElementById('overhead').textContent = `${config.overhead}TB (${config.overheadPercent}%)`;

        const faultToleranceText = config.faultTolerance === 0
            ? 'None'
            : `${config.faultTolerance} drive${config.faultTolerance > 1 ? 's' : ''}`;
        document.getElementById('fault-tolerance').textContent = faultToleranceText;
    }

    updateDescription() {
        const config = this.currentRAID.getConfig();
        const arrayConfig = this.currentRAID.calculateArrayConfig();

        document.getElementById('description-title').textContent = arrayConfig.name;
        document.getElementById('description-text').textContent = arrayConfig.description;

        const charList = document.getElementById('characteristics-list');
        charList.innerHTML = '';
        arrayConfig.characteristics.forEach(char => {
            const li = document.createElement('li');
            li.textContent = char;
            charList.appendChild(li);
        });
    }

    renderDrives() {
        this.drives = this.currentRAID.getDriveLayout();
        const container = document.getElementById('drive-container');
        container.innerHTML = '';

        // Get layout dimensions
        const dimensions = this.currentRAID.getLayoutDimensions();

        // Group drives by row
        const drivesByRow = {};
        for (let row = 0; row < dimensions.rows; row++) {
            drivesByRow[row] = [];
        }

        this.drives.forEach(drive => {
            drivesByRow[drive.row].push(drive);
        });

        // Create rows
        for (let row = 0; row < dimensions.rows; row++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'drive-row';

            // Sort drives by column within this row
            const rowDrives = drivesByRow[row].sort((a, b) => a.column - b.column);

            rowDrives.forEach(drive => {
                const driveEl = document.createElement('div');
                driveEl.className = `drive ${drive.type}`;
                driveEl.setAttribute('data-drive-id', drive.id);

                if (drive.status === 'failed') {
                    driveEl.classList.add('failed');
                } else if (drive.status === 'rebuilding') {
                    driveEl.classList.add('rebuilding');
                }

                const typeLabel = drive.type === 'parity' ? 'Parity' : drive.type === 'mixed' ? 'D+P' : 'Data';

                let driveContent = `
                    <div class="drive-label">${drive.label}</div>
                    <div class="drive-type">${typeLabel}</div>
                `;

                // Add blocks for RAID 5/6
                if (drive.blocks && drive.blocks.length > 0) {
                    driveContent += '<div class="drive-blocks">';
                    drive.blocks.forEach((block, idx) => {
                        driveContent += `<div class="drive-block ${block.type}" data-block-index="${idx}"></div>`;
                    });
                    driveContent += '</div>';
                } else {
                    driveContent += '<div class="drive-size">1TB</div>';
                }

                driveEl.innerHTML = driveContent;

                rowEl.appendChild(driveEl);
            });

            container.appendChild(rowEl);
        }

        this.updateArrayStatus();
    }

    performOperation(operation) {
        // Disable buttons during operation
        this.setButtonsEnabled(false);

        // Get healthy drives
        const healthyDrives = this.drives.filter(d => d.status === 'healthy');

        // Determine which drives participate and how to animate them
        let driveGroups = [];

        switch (this.currentRAID.level) {
            case '0':
                // RAID 0: Randomly pick one drive
                const raid0Index = Math.floor(Math.random() * healthyDrives.length);
                const raid0Drive = healthyDrives[raid0Index];
                if (raid0Drive) {
                    driveGroups = [[raid0Drive]];
                }
                break;

            case '1':
                // RAID 1: Randomly pick a column
                const columns1 = [...new Set(healthyDrives.map(d => d.column))];
                const randomCol1 = columns1[Math.floor(Math.random() * columns1.length)];

                if (operation === 'write') {
                    // Write: both mirrors of random column simultaneously
                    const columnDrives = healthyDrives.filter(d => d.column === randomCol1);
                    if (columnDrives.length > 0) {
                        driveGroups = [columnDrives];
                    }
                } else {
                    // Read: one drive from random mirror pair
                    const readDrive = healthyDrives.find(d => d.column === randomCol1);
                    if (readDrive) {
                        driveGroups = [[readDrive]];
                    }
                }
                break;

            case '5':
                if (operation === 'write') {
                    // RAID 5 write: Randomly pick a data block and its stripe
                    const driveCount = healthyDrives.length;
                    const numStripes = driveCount;

                    // Randomly pick a stripe
                    const stripeNum = Math.floor(Math.random() * numStripes);
                    const parityDriveIndex = (driveCount - 1 - stripeNum) % driveCount;

                    // Find a random data drive in this stripe (not the parity drive)
                    const possibleDataDrives = [];
                    for (let i = 0; i < driveCount; i++) {
                        if (i !== parityDriveIndex) {
                            possibleDataDrives.push(i);
                        }
                    }
                    const dataDriveIndex = possibleDataDrives[Math.floor(Math.random() * possibleDataDrives.length)];

                    const dataDrive = healthyDrives[dataDriveIndex];
                    const parDrive = healthyDrives[parityDriveIndex];

                    if (dataDrive) driveGroups.push([{ ...dataDrive, blockIndex: stripeNum }]);
                    if (parDrive) driveGroups.push([{ ...parDrive, blockIndex: stripeNum }]);
                } else {
                    // Read: random data block
                    const driveCount = healthyDrives.length;
                    const numStripes = driveCount;
                    const randomStripe = Math.floor(Math.random() * numStripes);
                    const parityDriveIndex = (driveCount - 1 - randomStripe) % driveCount;

                    // Pick a random data drive (not parity)
                    let dataDriveIndex = Math.floor(Math.random() * driveCount);
                    while (dataDriveIndex === parityDriveIndex) {
                        dataDriveIndex = Math.floor(Math.random() * driveCount);
                    }

                    const dataDrive = healthyDrives[dataDriveIndex];
                    if (dataDrive) {
                        driveGroups = [[{ ...dataDrive, blockIndex: randomStripe }]];
                    }
                }
                break;

            case '6':
                if (operation === 'write') {
                    // RAID 6 write: Randomly pick a data block and its stripe
                    const driveCount = healthyDrives.length;
                    const numStripes = driveCount;

                    // Randomly pick a stripe
                    const stripeNum = Math.floor(Math.random() * numStripes);
                    const parity1DriveIndex = (driveCount - 1 - stripeNum) % driveCount;
                    const parity2DriveIndex = (driveCount - 2 - stripeNum) % driveCount;

                    // Find a random data drive in this stripe (not a parity drive)
                    const possibleDataDrives = [];
                    for (let i = 0; i < driveCount; i++) {
                        if (i !== parity1DriveIndex && i !== parity2DriveIndex) {
                            possibleDataDrives.push(i);
                        }
                    }
                    const dataDriveIndex = possibleDataDrives[Math.floor(Math.random() * possibleDataDrives.length)];

                    const dataDrive = healthyDrives[dataDriveIndex];
                    const par1Drive = healthyDrives[parity1DriveIndex];
                    const par2Drive = healthyDrives[parity2DriveIndex];

                    if (dataDrive) driveGroups.push([{ ...dataDrive, blockIndex: stripeNum }]);
                    if (par1Drive && par2Drive) driveGroups.push([
                        { ...par1Drive, blockIndex: stripeNum },
                        { ...par2Drive, blockIndex: stripeNum }
                    ]);
                } else {
                    // Read: random data block
                    const driveCount = healthyDrives.length;
                    const numStripes = driveCount;
                    const randomStripe = Math.floor(Math.random() * numStripes);
                    const parity1DriveIndex = (driveCount - 1 - randomStripe) % driveCount;
                    const parity2DriveIndex = (driveCount - 2 - randomStripe) % driveCount;

                    // Pick a random data drive (not parity)
                    let dataDriveIndex = Math.floor(Math.random() * driveCount);
                    while (dataDriveIndex === parity1DriveIndex || dataDriveIndex === parity2DriveIndex) {
                        dataDriveIndex = Math.floor(Math.random() * driveCount);
                    }

                    const dataDrive = healthyDrives[dataDriveIndex];
                    if (dataDrive) {
                        driveGroups = [[{ ...dataDrive, blockIndex: randomStripe }]];
                    }
                }
                break;

            case '10':
                // RAID 10: Randomly pick a column
                const columns10 = [...new Set(healthyDrives.map(d => d.column))];
                const randomCol10 = columns10[Math.floor(Math.random() * columns10.length)];

                if (operation === 'write') {
                    // Write: both mirrors of random column simultaneously
                    const columnDrives = healthyDrives.filter(d => d.column === randomCol10);
                    if (columnDrives.length > 0) {
                        driveGroups = [columnDrives];
                    }
                } else {
                    // Read: one drive from random mirror pair
                    const readDrive = healthyDrives.find(d => d.column === randomCol10);
                    if (readDrive) {
                        driveGroups = [[readDrive]];
                    }
                }
                break;
        }

        // Animate drive groups (drives in same group animate simultaneously)
        driveGroups.forEach((group, groupIndex) => {
            setTimeout(() => {
                group.forEach(drive => {
                    const driveEl = document.querySelector(`[data-drive-id="${drive.id}"]`);
                    if (driveEl) {
                        // For RAID 5/6 with blocks, highlight specific block
                        if (drive.blockIndex !== undefined) {
                            const blockEl = driveEl.querySelector(`.drive-block[data-block-index="${drive.blockIndex}"]`);
                            if (blockEl) {
                                blockEl.classList.add('active');
                                setTimeout(() => blockEl.classList.remove('active'), 500);
                            }
                        } else {
                            // For other RAID levels, highlight entire drive
                            driveEl.classList.add('active');
                            setTimeout(() => driveEl.classList.remove('active'), 500);
                        }
                    }
                });
            }, groupIndex * 150);
        });

        // Calculate and display performance
        setTimeout(() => {
            const perf = this.currentRAID.simulatePerformance(operation, this.isDegraded, this.isRebuilding, this.settings);

            if (operation === 'write') {
                document.getElementById('write-latency').textContent = `${perf.latency}ms`;
            } else {
                document.getElementById('read-latency').textContent = `${perf.latency}ms`;
            }

            document.getElementById('iops').textContent = perf.iops.toLocaleString();
            document.getElementById('throughput').textContent = `${perf.throughput} MB/s`;

            this.setButtonsEnabled(true);
        }, driveGroups.length * 150 + 500);
    }

    failRandomDrive() {
        const healthyDrives = this.drives.filter(d => d.status === 'healthy');

        if (healthyDrives.length === 0) {
            alert('No healthy drives remaining!');
            return;
        }

        // Pick a random healthy drive
        const randomIndex = Math.floor(Math.random() * healthyDrives.length);
        const driveTofail = healthyDrives[randomIndex];

        driveTofail.status = 'failed';
        this.failedDrives.push(driveTofail.id);

        // Update visual
        const driveEl = document.querySelector(`[data-drive-id="${driveTofail.id}"]`);
        if (driveEl) {
            driveEl.classList.add('failed');
        }

        // Check if array can survive
        this.isDegraded = true;
        const canSurvive = this.currentRAID.canSurviveFailures(this.failedDrives.length);

        if (!canSurvive) {
            alert('CRITICAL: Array has failed! Data loss has occurred. Too many drives have failed.');
            this.updateArrayStatus();
            document.getElementById('fail-btn').disabled = true;
            document.getElementById('write-btn').disabled = true;
            document.getElementById('read-btn').disabled = true;
        } else {
            alert(`Drive ${driveTofail.label} has failed! Array is degraded but data is safe.`);
            document.getElementById('rebuild-btn').disabled = false;
        }

        this.updateArrayStatus();
    }

    startRebuild() {
        if (this.failedDrives.length === 0) {
            return;
        }

        // Get first failed drive
        const failedDriveId = this.failedDrives[0];
        const drive = this.drives.find(d => d.id === failedDriveId);

        if (!drive) return;

        this.rebuildingDrive = drive;
        drive.status = 'rebuilding';
        this.isRebuilding = true;
        this.rebuildProgress = 0;

        // Update visual
        const driveEl = document.querySelector(`[data-drive-id="${drive.id}"]`);
        if (driveEl) {
            driveEl.classList.remove('failed');
            driveEl.classList.add('rebuilding');
        }

        // Show rebuild status
        document.getElementById('rebuild-status').classList.remove('hidden');
        document.getElementById('rebuild-eta').textContent = this.currentRAID.estimateRebuildTime(1);
        document.getElementById('rebuild-btn').disabled = true;

        // Simulate rebuild progress
        this.rebuildInterval = setInterval(() => {
            this.rebuildProgress += 2;

            document.getElementById('rebuild-progress').style.width = `${this.rebuildProgress}%`;
            document.getElementById('rebuild-percent').textContent = this.rebuildProgress;

            if (this.rebuildProgress >= 100) {
                this.completeRebuild();
            }
        }, 100); // Update every 100ms for 5 second rebuild
    }

    completeRebuild() {
        clearInterval(this.rebuildInterval);

        if (this.rebuildingDrive) {
            this.rebuildingDrive.status = 'healthy';
            const driveEl = document.querySelector(`[data-drive-id="${this.rebuildingDrive.id}"]`);
            if (driveEl) {
                driveEl.classList.remove('rebuilding');
            }

            // Remove from failed drives list
            this.failedDrives = this.failedDrives.filter(id => id !== this.rebuildingDrive.id);
        }

        this.rebuildingDrive = null;
        this.isRebuilding = false;

        // Hide rebuild status
        setTimeout(() => {
            document.getElementById('rebuild-status').classList.add('hidden');
            document.getElementById('rebuild-progress').style.width = '0%';
        }, 1000);

        // Check if still degraded
        if (this.failedDrives.length === 0) {
            this.isDegraded = false;
        } else {
            document.getElementById('rebuild-btn').disabled = false;
        }

        this.updateArrayStatus();
        alert('Rebuild complete! Drive has been successfully reconstructed.');
    }

    resetArray() {
        // Clear any rebuild in progress
        if (this.rebuildInterval) {
            clearInterval(this.rebuildInterval);
        }

        this.drives = [];
        this.failedDrives = [];
        this.rebuildingDrive = null;
        this.rebuildProgress = 0;
        this.isDegraded = false;
        this.isRebuilding = false;

        // Reset UI
        document.getElementById('rebuild-status').classList.add('hidden');
        document.getElementById('rebuild-progress').style.width = '0%';
        document.getElementById('rebuild-btn').disabled = true;
        document.getElementById('fail-btn').disabled = false;
        document.getElementById('write-btn').disabled = false;
        document.getElementById('read-btn').disabled = false;

        // Reset metrics
        document.getElementById('write-latency').textContent = '-';
        document.getElementById('read-latency').textContent = '-';
        document.getElementById('iops').textContent = '-';
        document.getElementById('throughput').textContent = '-';

        this.renderDrives();
    }

    updateArrayStatus() {
        const statusEl = document.getElementById('array-status');
        const failedEl = document.getElementById('failed-drives');

        failedEl.textContent = this.failedDrives.length;

        if (this.failedDrives.length === 0) {
            statusEl.textContent = 'Healthy';
            statusEl.className = 'metric-value status-healthy';
        } else if (this.currentRAID.canSurviveFailures(this.failedDrives.length)) {
            statusEl.textContent = 'Degraded';
            statusEl.className = 'metric-value status-degraded';
        } else {
            statusEl.textContent = 'Failed';
            statusEl.className = 'metric-value status-failed';
        }
    }

    setButtonsEnabled(enabled) {
        const buttons = ['write-btn', 'read-btn', 'fail-btn'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = !enabled;
            }
        });
    }

    applyPreset(presetName) {
        const presets = {
            database: {
                ioPattern: 'random',
                blockSize: 4,
                readWriteRatio: 70,
                stripeSize: 64,
                cacheSize: 1024,
                cachePolicy: 'write-back',
                bbuEnabled: true,
                hotSpares: 1,
                recommendedRAID: '10'
            },
            video: {
                ioPattern: 'sequential',
                blockSize: 1024,
                readWriteRatio: 50,
                stripeSize: 1024,
                cacheSize: 512,
                cachePolicy: 'write-back',
                bbuEnabled: true,
                hotSpares: 0,
                recommendedRAID: '5'
            },
            web: {
                ioPattern: 'random',
                blockSize: 16,
                readWriteRatio: 95,
                stripeSize: 128,
                cacheSize: 512,
                cachePolicy: 'read-ahead',
                bbuEnabled: false,
                hotSpares: 0,
                recommendedRAID: '1'
            },
            backup: {
                ioPattern: 'sequential',
                blockSize: 256,
                readWriteRatio: 20,
                stripeSize: 1024,
                cacheSize: 256,
                cachePolicy: 'write-through',
                bbuEnabled: false,
                hotSpares: 1,
                recommendedRAID: '6'
            },
            vm: {
                ioPattern: 'random',
                blockSize: 8,
                readWriteRatio: 60,
                stripeSize: 128,
                cacheSize: 2048,
                cachePolicy: 'write-back',
                bbuEnabled: true,
                hotSpares: 1,
                recommendedRAID: '10'
            }
        };

        const preset = presets[presetName];
        if (!preset) return;

        // Apply settings
        this.settings = { ...preset };

        // Update UI
        document.querySelector(`input[name="io-pattern"][value="${preset.ioPattern}"]`).checked = true;
        document.getElementById('block-size').value = preset.blockSize;
        document.getElementById('rw-ratio').value = preset.readWriteRatio;
        document.getElementById('read-percent').textContent = `${preset.readWriteRatio}% Read`;
        document.getElementById('write-percent').textContent = `${100 - preset.readWriteRatio}% Write`;
        document.getElementById('stripe-size').value = preset.stripeSize;
        document.getElementById('cache-size').value = preset.cacheSize;
        document.getElementById('cache-policy').value = preset.cachePolicy;
        document.getElementById('bbu-enabled').checked = preset.bbuEnabled;
        document.getElementById('hot-spare').value = preset.hotSpares;

        // Show recommendation
        const presetNames = {
            database: 'Database Server',
            video: 'Video Storage',
            web: 'Web Server',
            backup: 'Backup Target',
            vm: 'VM Storage'
        };

        // Switch to recommended RAID level
        this.updateRAIDLevel(preset.recommendedRAID);

        // Show notification
        alert(`${presetNames[presetName]} preset applied!\n\nSwitched to RAID ${preset.recommendedRAID}`);
    }

    updatePerformanceImpact() {
        const impact = document.getElementById('performance-impact');
        const messages = [];
        let severity = 'info'; // info, warning, success

        const raidLevel = this.currentRAID.level;

        // Check I/O pattern vs RAID level
        if ((raidLevel === '5' || raidLevel === '6') && this.settings.ioPattern === 'random') {
            messages.push('⚠️ Random I/O with RAID 5/6 has 4-6x write penalty. Consider RAID 10 for better performance.');
            severity = 'warning';
        } else if ((raidLevel === '5' || raidLevel === '6') && this.settings.ioPattern === 'mixed') {
            messages.push('ℹ️ Mixed I/O on RAID 5/6 has moderate write penalty. Performance acceptable for balanced workloads.');
        }

        // Check block size vs stripe size alignment
        if (this.settings.blockSize > this.settings.stripeSize) {
            messages.push('⚠️ Block size exceeds stripe size - may cause inefficient I/O patterns.');
            severity = 'warning';
        } else if (this.settings.blockSize === this.settings.stripeSize) {
            messages.push('✓ Block size matches stripe size - optimal alignment for sequential operations.');
            if (severity === 'info') severity = 'success';
        }

        // Check cache settings
        if (this.settings.cacheSize === 0) {
            messages.push('ℹ️ No cache configured - performance will be limited to disk speed.');
        } else if (this.settings.cachePolicy === 'write-back' && !this.settings.bbuEnabled) {
            messages.push('⚠️ Write-back cache without BBU risks data loss on power failure!');
            severity = 'warning';
        } else if (this.settings.cachePolicy === 'write-back' && this.settings.bbuEnabled) {
            messages.push('✓ Write-back cache with BBU provides excellent performance with safety.');
            if (severity === 'info') severity = 'success';
        }

        // Check write-heavy workloads
        const writePercent = 100 - this.settings.readWriteRatio;
        if (writePercent > 40 && (raidLevel === '5' || raidLevel === '6')) {
            messages.push(`⚠️ Write-heavy workload (${writePercent}% writes) on RAID ${raidLevel} will see poor performance.`);
            severity = 'warning';
        }

        // Hot spare recommendation
        if (this.settings.hotSpares === 0 && (raidLevel !== '0')) {
            messages.push('ℹ️ Consider adding a hot spare to reduce recovery time after drive failure.');
        }

        // Estimate performance impact
        let perfMultiplier = 1.0;

        // Cache impact
        if (this.settings.cacheSize > 0) {
            perfMultiplier *= (1 + this.settings.cacheSize / 1000);
        }

        // I/O pattern impact on RAID 5/6
        if ((raidLevel === '5' || raidLevel === '6') && this.settings.ioPattern === 'random') {
            perfMultiplier *= 0.25; // 4x write penalty
        }

        // Block/stripe alignment
        if (this.settings.blockSize === this.settings.stripeSize) {
            perfMultiplier *= 1.15;
        }

        const perfChange = Math.round((perfMultiplier - 1) * 100);
        if (perfChange > 10) {
            messages.push(`📈 Estimated performance: +${perfChange}% vs baseline.`);
        } else if (perfChange < -10) {
            messages.push(`📉 Estimated performance: ${perfChange}% vs baseline.`);
        }

        // Update UI
        impact.className = `performance-impact ${severity}`;
        const messageHTML = messages.length > 0
            ? messages.join('<br>')
            : 'Current configuration looks good. Adjust settings to optimize for your workload.';
        document.getElementById('impact-message').innerHTML = messageHTML;
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new RAIDSimulator();
});
