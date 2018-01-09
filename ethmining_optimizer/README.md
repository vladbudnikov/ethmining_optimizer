Simple script to try multiple mining parameters for Ethereum mining. Blog post about this can be found [here](https://blog.vincent.frl/more-efficent-crypto-mining-in-azure/).

### Mind you
This is just a simple test script I am not responsible for any results.

### Current supported miners:
Both [Ethminer](https://github.com/ethereum-mining/ethminer) and [Claymore](https://github.com/nanopool/Claymore-Dual-Miner) are supported please send a PR if you have added another miner.

### How to use

Make sure you have [NodeJS](https://nodejs.org/en/) installed

```javascript

git clone https://github.com/vladbudnikov/ethmining_optimizer.git
cd ethmining_optimizer
npm i
node index -miner ethminer,claymore 

``` 