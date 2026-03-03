const axios = require('axios');

const DATA_API = 'https://data-api.polymarket.com';

/**
 * Fetch Top 50 traders from the leaderboard
 */
async function fetchTopTraders(limit = 50) {
    console.log(`Fetching Top ${limit} traders...`);
    const url = `${DATA_API}/v1/leaderboard?timePeriod=ALL&orderBy=PNL&limit=${limit}`;
    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
    });
    return response.data.map(t => ({
        address: t.proxyWallet,
        username: t.userName,
        lifetimePnl: parseFloat(t.pnl || '0')
    }));
}

/**
 * Fetch closed positions for a wallet
 */
async function fetchClosedPositions(address) {
    const url = `${DATA_API}/closed-positions?user=${address}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });
        return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
        console.error(`Error fetching closed positions for ${address}: ${err.message}`);
        return [];
    }
}

/**
 * Fetch activity history for a wallet (to count total trades)
 */
async function fetchActivity(address) {
    const url = `${DATA_API}/activity?user=${address}&limit=1000`;
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            }
        });
        return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
        console.error(`Error fetching activity for ${address}: ${err.message}`);
        return [];
    }
}

/**
 * Main calculation logic
 */
async function calculateProfitFactors() {
    const traders = await fetchTopTraders(50);
    const results = [];
    
    // 30 days ago timestamp
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoSec = Math.floor(thirtyDaysAgo / 1000);

    for (const trader of traders) {
        process.stdout.write(`Processing ${trader.username || trader.address}... `);
        
        // Fetch data
        const [positions, activities] = await Promise.all([
            fetchClosedPositions(trader.address),
            fetchActivity(trader.address)
        ]);

        // Filter closed positions in the last 30 days
        const recentPositions = positions.filter(p => (p.timestamp * 1000) >= thirtyDaysAgo);
        
        // Filter trades in activities in the last 30 days
        const recentTradesCount = activities.filter(a => a.type === 'TRADE' && (a.timestamp * 1000) >= thirtyDaysAgo).length;

        if (recentPositions.length === 0) {
            console.log("No closed positions in 30d window.");
            continue;
        }

        let grossProfit = 0;
        let grossLoss = 0;
        let wins = 0;
        let maxSingleProfit = 0;
        let totalPnl = 0;

        for (const pos of recentPositions) {
            const pnl = parseFloat(pos.realizedPnl || '0');
            totalPnl += pnl;
            if (pnl > 0) {
                grossProfit += pnl;
                wins++;
                if (pnl > maxSingleProfit) maxSingleProfit = pnl;
            } else if (pnl < 0) {
                grossLoss += Math.abs(pnl);
            }
        }

        // Compute Profit Factor
        let profitFactor;
        if (grossLoss === 0) {
            profitFactor = grossProfit > 0 ? Infinity : 0;
        } else {
            profitFactor = grossProfit / grossLoss;
        }

        // Compute additional metrics
        const winRate = (wins / recentPositions.length) * 100;
        const avgPnl = totalPnl / recentPositions.length;

        // Exclusion Criteria:
        // 1. Trade count < 20
        if (recentTradesCount < 20) {
            console.log(`Excluded (Trade count ${recentTradesCount} < 20)`);
            continue;
        }
        // 2. Profit Factor < 1.3
        if (profitFactor < 1.3) {
            console.log(`Excluded (Profit Factor ${profitFactor.toFixed(2)} < 1.3)`);
            continue;
        }
        // 3. One trade contributes > 40% of total profit
        if (grossProfit > 0 && (maxSingleProfit / grossProfit) > 0.4) {
            console.log(`Excluded (Single profit concentration ${(maxSingleProfit / grossProfit * 100).toFixed(1)}% > 40%)`);
            continue;
        }

        results.push({
            username: trader.username || trader.address,
            address: trader.address,
            profitFactor,
            grossProfit,
            grossLoss,
            winRate,
            avgPnl,
            tradeCount30d: recentTradesCount,
            closedPosCount30d: recentPositions.length
        });
        console.log("Done.");
    }

    // Sort by PF descending
    results.sort((a, b) => b.profitFactor - a.profitFactor);

    console.log('\n--- POLYMARKET TOP TRADERS PROFIT FACTOR (LAST 30 DAYS) ---');
    console.table(results.map(r => ({
        Trader: r.username,
        PF: r.profitFactor === Infinity ? 'Infinity' : r.profitFactor.toFixed(3),
        'Win Rate (%)': r.winRate.toFixed(1),
        'Avg PnL': `$${r.avgPnl.toFixed(2)}`,
        'Trades (30d)': r.tradeCount30d,
        'Closed Pos (30d)': r.closedPosCount30d
    })));
}

calculateProfitFactors().catch(err => {
    console.error("Fatal error:", err);
});
