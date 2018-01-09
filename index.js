const fs = require('fs');
const path = require('path');
let spawn = require("child_process").spawn;
const stats = require('simple-statistics')


//Const
const ETH_WALLET = `0xfff5eb47d1fb07550c9fb9788c7bece3570af227`;
const ETH_FARMING_URL = `http://eth-eu.dwarfpool.com:80/${ETH_WALLET}`;
const ETHMINER_PATH = './ethminer';
const CLAYMORE_PATH = './claymore-10.10/EthDcrMiner64.exe';
const MIN_PER_RUN = 7;
const MAILGUN_API_KEY = '';
const MAILGUN_DOMAIN = '';
const USEMALGUN = true;
const MAILGUN_TO_EMAIL ='';


//Runtine vars
let runId = Math.round((Math.pow(36, 5 + 1) - Math.random() * Math.pow(36, 5))).toString(36).slice(1);
let runNum = 0;
let busy = false;
let miningInRun = false
let resultTable = [];
let currentMiner = '';
let intervalId;


/**
 * Start function to get the miners which user wants to use from the command line parameters
 */
function init() {
    //check which miners we will use
    if (process.argv.indexOf("-miner") != -1) {
        miners = process.argv[process.argv.indexOf("-miner") + 1];
        try {
            miners = miners.split(',');
            // loop trough miners to create possibilities
            miners.forEach((element) => {
                if (element == 'ethminer') {
                    createPossibilitiesEthminer()
                }
                if (element == 'claymore') {
                    createPossibilitiesClaymore()
                }
            })
            main();

        }
        catch (err) {
            console.log(err)
            console.error('Can not parse miner argument')
        }

    }
}

/**
 * Function to control the entire workflow
 */
function main() {
    console.log(`run num ${runNum} keys: ${Object.keys(resultTable).length}`)
    if (!busy && runNum < resultTable.length) {
        miningInRun = false;
        startRun({
            run: runNum,
            parameters: resultTable[runNum].parameters,
            log: true,
            minerPath: resultTable[runNum].minerPath,
            miner: resultTable[runNum].miner
        });
        runNum++;
		console.log(resultTable[runNum].results[0]);

		currentMiner = resultTable[runNum].miner;

        setTimeout(function () {
            console.log(`Stop current run`)
            endRun()
            busy = false;
            // give 2 sec between run to kill process
            saveResult((err, result) => {
                setTimeout(function () {
                    main()
                }, 2 * 1000)

            })
        }, MIN_PER_RUN * 60 * 1000)
    } else {
        saveResult((err, result) => {
            sendMail(result)
        })
        analyse((err, result) => {
            console.log(`best run index: ${result.index} avg: ${result.avg}`)
            console.log('starting to mine with best results')
            setTimeout(() => {
                startRun({
                    runNum: 0,
                    parameters: resultTable[result.index].parameters,
                    log: false,
                    minerPath: resultTable[result.index].minerPath,
                    miner: resultTable[result.index].miner
                })
            }, 2 * 1000);
        })
    }
}

/**
 * Get the best run from all the results
 */
function analyse(cb) {
    let highestIndex = 0;
    let highestAvg = 0
    for (let i in resultTable) {
        try {
            if (stats.average(resultTable[i].results) > highestAvg) {
                highestIndex = i;
                highestAvg = stats.average(resultTable[i].results);
            }
        }
        catch (err) {
            console.error(err)
        }
    }
    cb(null, {
        index: highestIndex,
        avg: highestAvg
    })
};


/**
 * Start ming with set parameters and listen to the output generated from the process
 * @param {Object} options 
 * @param {Number} options.run Numerical indentifier for the run
 * @param {String} options.parameters Parameters to pass the eth miner
 * @param {String} options.minerPath the specified miner
 */
function startRun(options) {
    console.log('start run')
    args = options.parameters.split(' ')
    console.log(args)

    let child = spawn(require.resolve(options.minerPath), args)
    child.stdout.on("data", function (data) {
        console.log("Powershell Data: " + data);
    });

    if (options.miner == 'claymore' && options.log) {
        startMonitorClaymore(options.run)
    }

    child.stderr.on("data", function (data) {
        console.log("Powershell err Data: " + data);
        if (options.log) {
            logResult(data, options.run)
        }

    });
    child.on("exit", function () {
        console.log("Powershell Script finished");
    });
    child.on('*', (data) => {
        console.log('dadasdasdasd ' + data)
    })
    child.on('error', function (error) {
        console.log('another err ' + error)
    });
    child.stdin.end();
};

/**
 * Monitor the claymore miner, by sending JSONRPC to the claymore webserver
 * @param {Number} runNum 
 */
function startMonitorClaymore(runNum) {
    console.log('start monitor claymore')
    intervalId = setInterval(() => {
        var net = require('net');
        var client = new net.Socket();
        try {
            client.connect(3333, 'localhost', function () {
                console.log('Connected');
                client.write('{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}');
            });
        } catch (err) {
            console.error(err)
        }
        client.on('data', function (data) {
            console.log('Received: ');
            console.log(JSON.parse(data))
            data = JSON.parse(data)
            let rate = Number(data.result[2].split(';')[0])

            if (rate != 0) {
                miningInRun = true;

            }
            if (miningInRun) {
                rate = rate / 1000
                console.log('push to result: ' + rate)
                resultTable[runNum].results.push(rate)
            }

            client.destroy();
        });
        client.on('close', function () {
            console.log('Connection closed');
        });

    }, 20000);
}

function endRun() {
    if (currentMiner == 'ethminer') {
        //Kill all ethminer processes
		//Windows version
        //let kill = spawn("taskkill", ['-F', '-IM', 'ethminer.exe']);
		//Linux version
		let kill = spawn('grep', ['ethminer']);
    } else if (currentMiner == 'claymore') {
        //Stop monitoring Claymore's web server
        clearInterval(intervalId)
        //Kill all claymore miner processes
		//Windows version
        //let kill = spawn("taskkill", ['-F', '-IM', 'EthDcrMiner64.exe']);
		//Linux version
		let kill = spawn('grep', ['EthDcrMiner64']);
    }

}
/**
 * Parse and log all Ethminer results
 */
function logResult(result, run) {
    data = result.toString()
    if (data.indexOf('Speed') != -1) {
        let rate;
        
		rate = data.split(" Mh/s")[0];
        rate = rate.split('Speed ')[1];
        //rate = Number(rate)
		console.log(rate)
		
        if (rate != 0) {
            miningInRun = true;

        }
        if (miningInRun) {
            console.log(`Push to result rate: ${rate}`)
            resultTable[run].results.push(rate)
        }
    }
}

function saveResult(cb) {
    fs.writeFile(`./runresults/runresult-${runId}.json`, JSON.stringify(resultTable), (err, result) => {
        cb(null, runId)
    })
}


function sendMail(runId) {
    if (USEMALGUN) {
        try{
            const filepath = path.join(__dirname, `runresults/runresult-${runId}.json`);
            let  mailgun = require('mailgun-js')({ apiKey: MAILGUN_API_KEY, domain: MAILGUN_DOMAIN });
                    let data = {
                        from: 'Ming results',
                        to: MAILGUN_TO_EMAIL,
                        subject: 'Run complete',
                        text: 'Yes! run is done see attachment for raw results.',
                        attachment: filepath
                    };
            
                    mailgun.messages().send(data, function (error, body) {
                        console.log(body);
                    });
        }catch(err){
            console.error('Failed to send email')
            console.error(err)
        }

    }

}

function createPossibilitiesEthminer() {
    let possibilites = [
        {
            parameter: '--cuda-parallel-hash',
            possible: [4, 8]
        },
        {
            parameter: '--cuda-block-size',
            possible: [64, 128, 256]
        },
        {
            parameter: '--cuda-streams',
            possible: [4, 8, 16]
        },
        {
            parameter: '--cuda-grid-size',
            possible: [32768, 65536, 131072]
        }
    ];

    let parameters = possibilites.length;

    let possibleStrings = []

    for (let i in possibilites[0].possible) {
        for (let y in possibilites[1].possible) {
            for (let u in possibilites[2].possible) {
                for (let o in possibilites[3].possible) {
                    possibleStrings.push(`-U ${possibilites[0].parameter} ${possibilites[0].possible[i]} ${possibilites[1].parameter} ${possibilites[1].possible[y]} ${possibilites[2].parameter} ${possibilites[2].possible[u]} ${possibilites[3].parameter} ${possibilites[3].possible[o]} -F ${ETH_FARMING_URL}`)
                }
            }
        }
    }
    possibleStrings.push(`-G -F ${ETH_FARMING_URL}`)
    possibleStrings.push(`-U -F ${ETH_FARMING_URL}`)

    for (let i in possibleStrings) {
        resultTable.push({
            parameters: possibleStrings[i],
            miner: 'ethminer',
            results: [],
            minerPath: ETHMINER_PATH
        })
    }
    return 'done'
}

function createPossibilitiesClaymore() {
    let possibilites = [
        {
            parameter: '-mode',
            possible: [1]
        },
        {
            parameter: '-platform',
            possible: [2]
        },
        {
            parameter: '-dcri',
            possible: [30, 40, 50, 60, 70, 80, 90, 100, 110]
        }
    ];

    let parameters = possibilites.length;

    let possibleStrings = []

    for (let i in possibilites[0].possible) {
        for (let y in possibilites[1].possible) {
            for (let u in possibilites[2].possible) {
                possibleStrings.push(`${possibilites[0].parameter} ${possibilites[0].possible[i]} ${possibilites[1].parameter} ${possibilites[1].possible[y]} ${possibilites[2].parameter} ${possibilites[2].possible[u]} -epool eth-eu.dwarfpool.com:8008 -ewal 0x8e9137Fa982C0Af6EF94D0f7A15dafaCB6EAb725/claymoretest -epsw x`)
            }
        }
    }
    possibleStrings.push('-epool eth-eu.dwarfpool.com:8008 -ewal 0x8e9137Fa982C0Af6EF94D0f7A15dafaCB6EAb725/claymoretest -epsw x')
    for (let i in possibleStrings) {
        resultTable.push({
            parameters: possibleStrings[i],
            miner: 'claymore',
            results: [],
            minerPath: CLAYMORE_PATH
        })
    }
    return 'done'
}
init();
