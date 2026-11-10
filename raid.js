// RAID Configuration and Simulation Logic

class RAIDConfig {
    constructor(level) {
        this.level = level;
        this.configs = {
            '0': {
                name: 'RAID 0 - Striping',
                description: 'RAID 0 stripes data across multiple drives without redundancy. It offers maximum performance and capacity but no fault tolerance. A single drive failure results in complete data loss.',
                characteristics: [
                    'Maximum performance - data striped across all drives',
                    'Full capacity utilization (100% efficient)',
                    'No fault tolerance - any drive failure = data loss',
                    'Best for: Temporary data, caching, maximum speed needed',
                    'Minimum drives: 2'
                ],
                minDrives: 2,
                calculateDrives: (usableCapacity, driveSize) => usableCapacity / driveSize,
                faultTolerance: 0,
                writeLatency: 1.0,
                readLatency: 1.0,
                iopsMultiplier: 1.0,
                throughputMultiplier: 1.0
            },
            '1': {
                name: 'RAID 1 - Mirroring',
                description: 'RAID 1 creates an exact mirror of data across two or more drives. It provides excellent fault tolerance and read performance but uses 50% capacity for redundancy.',
                characteristics: [
                    'Complete data redundancy - full mirror',
                    '50% capacity efficiency (2x drives needed)',
                    'Survives failure of all but one drive',
                    'Good read performance (can read from any drive)',
                    'Best for: Critical data, operating systems, small databases',
                    'Minimum drives: 2'
                ],
                minDrives: 2,
                calculateDrives: (usableCapacity, driveSize) => (usableCapacity / driveSize) * 2,
                faultTolerance: 1,
                writeLatency: 1.2,
                readLatency: 0.9,
                iopsMultiplier: 0.9,
                throughputMultiplier: 0.5
            },
            '5': {
                name: 'RAID 5 - Distributed Parity',
                description: 'RAID 5 distributes parity information across all drives, allowing the array to survive a single drive failure. It offers a good balance between performance, capacity, and redundancy.',
                characteristics: [
                    'Distributed parity for fault tolerance',
                    'Capacity efficiency: (n-1)/n drives (83% for 6 drives)',
                    'Survives single drive failure',
                    'Good for sequential reads/writes',
                    'Write penalty: 4x I/O operations (read-modify-write)',
                    'Best for: File servers, archival storage, video storage',
                    'Minimum drives: 3'
                ],
                minDrives: 3,
                calculateDrives: (usableCapacity, driveSize) => (usableCapacity / driveSize) + 1,
                faultTolerance: 1,
                writeLatency: 2.0,
                readLatency: 1.1,
                iopsMultiplier: 0.6,
                throughputMultiplier: 0.83
            },
            '6': {
                name: 'RAID 6 - Dual Parity',
                description: 'RAID 6 uses dual parity, allowing the array to survive two simultaneous drive failures. It provides higher fault tolerance than RAID 5 but with increased write penalty.',
                characteristics: [
                    'Dual distributed parity (P+Q)',
                    'Capacity efficiency: (n-2)/n drives (71% for 7 drives)',
                    'Survives two simultaneous drive failures',
                    'Essential for large drives (URE protection)',
                    'Write penalty: 6x I/O operations',
                    'Best for: Critical data, large arrays, archival systems',
                    'Minimum drives: 4'
                ],
                minDrives: 4,
                calculateDrives: (usableCapacity, driveSize) => (usableCapacity / driveSize) + 2,
                faultTolerance: 2,
                writeLatency: 2.5,
                readLatency: 1.2,
                iopsMultiplier: 0.5,
                throughputMultiplier: 0.71
            },
            '10': {
                name: 'RAID 10 - Mirrored Stripes',
                description: 'RAID 10 combines mirroring and striping. It stripes data across mirrored pairs, providing excellent performance and fault tolerance at 50% capacity efficiency.',
                characteristics: [
                    'Striping across mirrored pairs (RAID 1+0)',
                    '50% capacity efficiency',
                    'Survives multiple drive failures (if not in same mirror)',
                    'Excellent read and write performance',
                    'No parity calculation overhead',
                    'Best for: Databases, high-performance applications',
                    'Minimum drives: 4'
                ],
                minDrives: 4,
                calculateDrives: (usableCapacity, driveSize) => (usableCapacity / driveSize) * 2,
                faultTolerance: 1,
                writeLatency: 1.3,
                readLatency: 0.85,
                iopsMultiplier: 1.2,
                throughputMultiplier: 0.5
            }
        };
    }

    getConfig() {
        return this.configs[this.level];
    }

    calculateArrayConfig(usableCapacityTB = 5, driveSizeTB = 1) {
        const config = this.getConfig();
        const totalDrives = Math.ceil(config.calculateDrives(usableCapacityTB, driveSizeTB));
        const rawCapacity = totalDrives * driveSizeTB;
        const overhead = rawCapacity - usableCapacityTB;
        const overheadPercent = ((overhead / rawCapacity) * 100).toFixed(1);

        return {
            totalDrives,
            usableCapacity: usableCapacityTB,
            rawCapacity,
            overhead,
            overheadPercent,
            faultTolerance: config.faultTolerance,
            name: config.name,
            description: config.description,
            characteristics: config.characteristics
        };
    }

    getDriveLayout() {
        const config = this.getConfig();
        const arrayConfig = this.calculateArrayConfig();
        const drives = [];

        switch (this.level) {
            case '0':
                // RAID 0: 5 columns, 1 row - each column is unique data
                for (let i = 0; i < arrayConfig.totalDrives; i++) {
                    drives.push({
                        id: i,
                        type: 'data',
                        label: `D${i + 1}`,
                        status: 'healthy',
                        column: i,
                        row: 0
                    });
                }
                break;

            case '1':
                // RAID 1: 5 columns, 2 rows - each column is mirrored data
                const columns1 = arrayConfig.totalDrives / 2;
                for (let i = 0; i < arrayConfig.totalDrives; i++) {
                    const col = i % columns1;
                    const row = Math.floor(i / columns1);
                    drives.push({
                        id: i,
                        type: 'data',
                        label: `D${col + 1}`,
                        status: 'healthy',
                        column: col,
                        row: row,
                        mirror: row === 0 ? i + columns1 : i - columns1
                    });
                }
                break;

            case '5':
                // RAID 5: Distributed parity across all drives
                // Number of stripes equals number of drives for full rotation
                const numStripes5 = arrayConfig.totalDrives;
                for (let i = 0; i < arrayConfig.totalDrives; i++) {
                    const blocks = [];
                    for (let stripe = 0; stripe < numStripes5; stripe++) {
                        // Parity rotates: stripe 0 parity on last drive, stripe 1 on second-to-last, etc.
                        const parityDrive = (arrayConfig.totalDrives - 1 - stripe) % arrayConfig.totalDrives;
                        blocks.push({
                            type: i === parityDrive ? 'parity' : 'data',
                            stripe: stripe
                        });
                    }
                    drives.push({
                        id: i,
                        type: 'mixed', // Contains both data and parity
                        label: `D${i + 1}`,
                        status: 'healthy',
                        column: i,
                        row: 0,
                        blocks: blocks
                    });
                }
                break;

            case '6':
                // RAID 6: Dual distributed parity across all drives
                // Number of stripes equals number of drives for full rotation
                const numStripes6 = arrayConfig.totalDrives;
                for (let i = 0; i < arrayConfig.totalDrives; i++) {
                    const blocks = [];
                    for (let stripe = 0; stripe < numStripes6; stripe++) {
                        // First parity (P) rotates similar to RAID 5
                        const parity1Drive = (arrayConfig.totalDrives - 1 - stripe) % arrayConfig.totalDrives;
                        // Second parity (Q) is one position before P
                        const parity2Drive = (arrayConfig.totalDrives - 2 - stripe) % arrayConfig.totalDrives;

                        let blockType = 'data';
                        if (i === parity1Drive) blockType = 'parity1';
                        else if (i === parity2Drive) blockType = 'parity2';

                        blocks.push({
                            type: blockType,
                            stripe: stripe
                        });
                    }
                    drives.push({
                        id: i,
                        type: 'mixed',
                        label: `D${i + 1}`,
                        status: 'healthy',
                        column: i,
                        row: 0,
                        blocks: blocks
                    });
                }
                break;

            case '10':
                // RAID 10: 5 columns, 2 rows - mirrored stripes
                const columns10 = arrayConfig.totalDrives / 2;
                for (let i = 0; i < arrayConfig.totalDrives; i++) {
                    const col = i % columns10;
                    const row = Math.floor(i / columns10);
                    drives.push({
                        id: i,
                        type: 'data',
                        label: `D${col + 1}`,
                        status: 'healthy',
                        column: col,
                        row: row,
                        mirror: row === 0 ? i + columns10 : i - columns10
                    });
                }
                break;
        }

        return drives;
    }

    getLayoutDimensions() {
        const arrayConfig = this.calculateArrayConfig();

        switch (this.level) {
            case '0':
                return { columns: arrayConfig.totalDrives, rows: 1 };
            case '1':
                return { columns: arrayConfig.totalDrives / 2, rows: 2 };
            case '5':
                return { columns: arrayConfig.totalDrives, rows: 1 };
            case '6':
                return { columns: arrayConfig.totalDrives, rows: 1 };
            case '10':
                return { columns: arrayConfig.totalDrives / 2, rows: 2 };
            default:
                return { columns: arrayConfig.totalDrives, rows: 1 };
        }
    }

    simulatePerformance(operation = 'read', isDegraded = false, isRebuilding = false, settings = {}) {
        const config = this.getConfig();
        const baseLatency = 5; // Base latency in ms for HDD
        let latency = baseLatency;
        let iops = 1000; // Base IOPS
        let throughput = 500; // Base throughput in MB/s

        // Apply RAID-specific multipliers
        if (operation === 'write') {
            latency *= config.writeLatency;
            iops *= config.iopsMultiplier;
        } else {
            latency *= config.readLatency;
            iops *= config.iopsMultiplier * 1.2; // Reads are generally faster
        }

        // Apply advanced settings if provided
        if (settings && Object.keys(settings).length > 0) {
            // I/O Pattern impact
            if (settings.ioPattern === 'random') {
                // Random I/O: worst case for parity RAID writes
                if ((this.level === '5' || this.level === '6') && operation === 'write') {
                    latency *= 2.0; // Full random write penalty
                    iops *= 0.5;
                } else {
                    latency *= 1.2; // General random I/O overhead
                    iops *= 0.9;
                }
            } else if (settings.ioPattern === 'mixed') {
                // Mixed I/O: moderate penalty (realistic for most workloads)
                if ((this.level === '5' || this.level === '6') && operation === 'write') {
                    latency *= 1.4; // Moderate write penalty
                    iops *= 0.7;
                } else {
                    latency *= 1.1;
                    iops *= 0.95;
                }
            } else if (settings.ioPattern === 'sequential') {
                // Sequential I/O: best case, optimal for all RAID types
                latency *= 0.9;
                iops *= 1.1;
                throughput *= 1.2;
            }

            // Block size impact (smaller blocks = more overhead)
            const blockSize = settings.blockSize || 64;
            if (blockSize < 16) {
                latency *= 1.2;
                iops *= 0.8;
            } else if (blockSize >= 256) {
                latency *= 0.9;
                throughput *= 1.2;
            }

            // Cache impact
            const cacheSize = settings.cacheSize || 0;
            if (cacheSize > 0) {
                const cacheBonus = 1 + (cacheSize / 1000);
                if (settings.cachePolicy === 'write-back' && operation === 'write') {
                    latency *= 0.3; // Dramatic write latency improvement
                    iops *= cacheBonus;
                } else if (settings.cachePolicy === 'read-ahead' && operation === 'read') {
                    latency *= 0.7;
                    iops *= cacheBonus;
                }
            }

            // Read/write ratio doesn't directly affect single operation, but included for completeness
            const writePercent = 100 - (settings.readWriteRatio || 70);
            if (operation === 'write' && writePercent > 50 && (this.level === '5' || this.level === '6')) {
                iops *= 0.8; // Heavy write workload on parity RAID
            }
        }

        // Apply degradation
        if (isDegraded) {
            latency *= 1.3;
            iops *= 0.7;
            throughput *= 0.7;
        }

        // Apply rebuilding penalty
        if (isRebuilding) {
            latency *= 1.5;
            iops *= 0.5;
            throughput *= 0.5;
        }

        throughput *= config.throughputMultiplier;

        return {
            latency: latency.toFixed(1),
            iops: Math.round(iops),
            throughput: Math.round(throughput)
        };
    }

    canSurviveFailures(failedCount) {
        const config = this.getConfig();
        return failedCount <= config.faultTolerance;
    }

    estimateRebuildTime(driveSizeTB = 1) {
        // Rebuild time estimation: ~4-8 hours per TB
        const baseHoursPerTB = 6;
        const totalHours = driveSizeTB * baseHoursPerTB;

        if (totalHours < 1) {
            return `${Math.round(totalHours * 60)} minutes`;
        }
        return `${totalHours.toFixed(1)} hours`;
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RAIDConfig;
}
