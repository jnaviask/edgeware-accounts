import { Keyring, ApiRx, WsProvider } from '@polkadot/api';
import { Option } from '@polkadot/types';
import { Hash } from '@polkadot/types/interfaces';
import { Mainnet } from '@edgeware/node-types';
import { switchMap, first } from 'rxjs/operators';
import { of } from 'rxjs';
import { xxhashAsHex } from '@polkadot/util-crypto';
import { u8aToU8a, u8aToHex } from '@polkadot/util';

import { SignedBlock } from '@polkadot/types/interfaces/runtime';
import { Call, AccountId } from '@polkadot/types/interfaces';
const fs = require('fs');

export const mainnet = 'ws://mainnet1.edgewa.re:9944';;

export const eApi = (url) => new ApiRx({
  provider : new WsProvider(url),
  types: {
    // Address: 'GenericAddress',
    // Keys: 'SessionKeys4',
    // StakingLedger: 'StakingLedgerTo240',
    // Votes: 'VotesTo230',
    // ReferendumInfo: 'ReferendumInfoTo239',
    // Weight: 'u32',
    // RewardDestination: 'RewardDestinationTo257',
    // DispatchInfo: 'DispatchInfoTo244',
    // OpenTip: 'OpenTipTo225',
    ...Mainnet.types,
  },
  typesAlias: Mainnet.typesAlias,
});

const parseAccountFromArgs = (args: Call) => {
  if ((args.section === 'balances' && args.method === 'transfer')
    || (args.section === 'staking' && args.method === 'bond'
    || args.section === 'staking' && args.method === 'setController')
  ) {
    return args.args[0];
  } else {
    return null;
  }
}

const parseBlock = (signedBlock: SignedBlock, cb) => {
  // get extrinsics
  const extrinsics = signedBlock.block.extrinsics;
  // get accounts from extrinsics
  extrinsics.toArray().forEach(e => {
    // store signer account in map
    let signer;
    const others = [];

    if (e.signer.toHex() !== '0x00') {
      signer = e.signer;
    }

    let other = parseAccountFromArgs(e.method);
    if (other) others.push(other);

    if (e.method.section === 'utility' && e.method.method === 'batch') {
      const arr = Array(e.method.args[0].toHuman())[0];
      (arr as Array<any>).forEach(args => {
        other = parseAccountFromArgs(args as Call);
        if (other) others.push(other);
      })
    }

    cb({ signer, others, block: signedBlock })
  });
};

export const pollAllAccounts = async (api: ApiRx, cb: Function, top: number, low?: number) => {
  console.log(`Highest ${top}, lowest ${low}`);
  for (let i = top; i > 0; i--) {
    if (i % 10000 === 0) console.log(i);
    try {
      // returns Hash
      const blockHash = await api.rpc.chain.getBlockHash(i).toPromise();
      const signedBlock = await api.rpc.chain.getBlock(blockHash).toPromise();
      parseBlock(signedBlock, cb);
    } catch (e) {
      console.log(`Failed on block ${i}`);
    }

    if (i <= low) {
      break;
    }
  }
}

export const findStorageWriteBlock = async (api: ApiRx, key: string, startBlock: number, endBlock: number, currentBlock?: number): Promise<number> => {
  if (startBlock > endBlock) throw new Error('invalid range');
  if (startBlock === endBlock) return -1;
  if (!currentBlock) currentBlock = startBlock;
  // console.log('Querying block #' + currentBlock);
  const hash = await api.rpc.chain.getBlockHash(currentBlock).pipe(first()).toPromise();
  const storage = await api.rpc.state.getStorage<Option<any>>(key, hash).pipe(first()).toPromise();
  if (storage.isSome) {
    if (currentBlock === endBlock) return currentBlock;
    return findStorageWriteBlock(api, key, startBlock, currentBlock, startBlock + Math.floor((currentBlock - startBlock) / 2));
  } else {
    return findStorageWriteBlock(api, key, currentBlock, endBlock, currentBlock + Math.ceil((endBlock - currentBlock) / 2));
  }
}

// TODO: write a binary search algorithm to determine the block when a storage item was
//    first set
export const queryStorage = async (api: ApiRx, key, block?) => {
  const keys = [
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9004ee3bb7c9aaeea2beca8732a7c96f4925668f7cd0815e9995b5e011d2fc16e",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da90057e947689813af65357e9c72f2bc7e29433851162b9240fc7f3401cb978738",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9075491ea6df03ab0ca0af2aa0f398ddc394b0bd1ac569f305fe0f73c914d8a89",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da90a41b262709e64dc9956e5e93db4a7e217db6ccff10125e3fe2e561a910e0195",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da90b59bc7950734874602c61fce4d52f3144cb0ff28042123e2c3aa7c4ff612601",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da90e4d7f2c4c7a39cce0d2fab3e858e6509b73cc4bf9709be0500b9c0302d3b53c",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da90eac5cb6faa1d33085ef99ab53c6074e41f4090683f39db939517054fb5f88e9",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9144d09d98cc6bc9df6f5f5609e32a8c70d1a9621cef8370078eb1a67491b2d9f",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da92db4171d02beb6efb90331bafb3ccead5a4c650f309e30f9679f6e0575adaca1",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da92e0c6bb8a8043818fed81d43cbfccef1e52945d7ea76a756853d751df85a310f",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da944c24ae5951c554dd2f9ddab567c8329a0437dc1fcb2bbe6188638f2a444b213",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9459bb9dd7d9c431f9bb694489ee7519c115e59543162b2247e388a7b5c3383f3",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da947d1dffaaf7cee553b4dd7243d95d0005ae058afa8d1a628343fb6e2a7f9b699",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9538abbf1b5788de238fb7f11fa9710dcc7d674ad67f22f18898a1284f41124c7",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da953c62bc7d2c8d3643682c50db52764ff50a6a0cf3ff217f6ae5791275c920910",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da963eae17575c33db0c60cc237ddaec18549205eb7ff15d58626fbc89862a4f1df",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da967f07444cddb95bfb10ef27bb24579970f0c3ae7f9eb25c82305286153dd2dd7",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da96dd3fcdc948150d600d2fd0443123db11a3d0c77e0966b59e4bcea72128b078a",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da97d5937a54039852568f951ff806cf2fb80376810d5dddd7aac5410c517e766cf",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da98f140d1e302b228e81f4f6e0cfea14b3ad6e43b1894b2f433e047fc15cbbe66a",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9911c37ecf023e5b11c7ec47ecb01fccb1b642f126f8a547cf707c078a728cd13",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da991cf1990bff8d4fee051a14b80640acbc7023a3bb28a5624e861997c9e2e0785",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da997c543402c0452633c51c0ad3bf49c5d050d52bac16e447c712a9e32699dea73",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da999ddad41f9d074cd44acdad9735f9b9cbdc991d41948624e171a774a4a3d1dc0",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9a72e4e6c1d148d5a2c4aa29928ddf00ee872e1dd3b2b12c370d1fa69d20095f1",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9b9b7edf03df0659ad7526b6cbcb539b410edd1f29df43c81ba9f186a33b87975",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9bd1e7e882ef909d84ab0c010b9736702ba564508928fa8f25e7858be3770bfee",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9c4d5cb17009056a2b52e918a255c8a5a5e2f7465397c7809b6b9f032c5fe7bd4",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9cf56908c3df0a90bb4fd5f4e7fd95f126ebd56177a44a8bf02d9aeaa1c291b27",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9d991e84db986b531962879a34540fd9ee9edcc20e0eef6d65970772d70704ea7",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9db53f0087eae0b111cb215c88cbc882cc83a962f76044bf0f5e68b8e9115f409",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9dc3a5fc5c087699ca0ca85b9a7283cbceb29739e57a3ae933c4d3cd0c6739dce",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9e02bd14c8e3e79b75c46dc914e457be28a0f1eb100d0cd49c86eefb160cf8e33",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9e38596435133916ae1f7a40b240f268e2c37411f6c364890d6f07f568b56b452",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9e47a04c91cfb988599962c83a74cb69324c8afb117501632cb27acb09d73af66",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9e4e11d60e29322706c8c4cca13541da26614e3f9a8956145dd9240b20d325a48",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9f150eb3066e8c0ec2f9d2d675f7b1144790be7cb61b8ee63cfd29f3167a5c686",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9f78f5247353ec1db6953516a7217fd57dd9fcce9d7da448fc381a0622cc034bf",
    "0xc2261276cc9d1f8598ea4b6a74b15c2fb99d880ec681799c0cf30e8886371da9f8aaeb445ddfcc4358be7cfd377d9f6c784dcefed0501d9d04488aca6ec09518",
  ];

  /*
  const migrationBlock = 3139199;
  console.log(xxhashAsHex('Balances', 128));
  console.log(xxhashAsHex('Account', 128));
  const prefix = xxhashAsHex('Balances', 128) + xxhashAsHex('Account', 128).slice(2);
  const hash = await api.rpc.chain.getBlockHash(migrationBlock).pipe(first()).toPromise();
  const premigrateKeys = await api.rpc.state.getKeys(prefix, hash).pipe(first()).toPromise();

  // remove prefixes
  const premigrateHashes = premigrateKeys.map((key) => u8aToHex(key).slice(34));

  // verify all postmigrate hashes are found in the premigrate hashes
  for (const post of postmigrateKeys) {
    const accountHash = post.slice(34);
    const idx = premigrateHashes.indexOf(accountHash);
    if (idx === -1) {
      console.log(`Could not find previous hash for ${post}!`);
    }
  }
  return;*/

  const results = [];
  for (const k of keys) {
    const blockNumber = await findStorageWriteBlock(api, k, 1, 3139199);
    if (blockNumber !== -1) {
      const hash = await api.rpc.chain.getBlockHash(blockNumber).pipe(first()).toPromise();
      const block = await api.rpc.chain.getBlock(hash).pipe(first()).toPromise();
      const xfer = block.block.extrinsics.find((e) => e.method.method.startsWith('transfer'));
      if (xfer) {
        const acct = xfer.args[0].toString();
        results.push(acct);
        const balance = await api.query.system.account(acct).pipe(first()).toPromise();
        console.log(`Found transfer account: ${acct}: ${balance.data.free.toHuman()}`);
      } else {
        const extrinsics = block.block.extrinsics.toHuman(false);
        console.log(`Extrinsics at ${blockNumber}: ${JSON.stringify(extrinsics, null, 2)}\n`);
      }
    }
  }
  // console.log(results.map((r) => r.toString()));
  /*
  console.log(`Querying keys at block ${block || 'latest'}.`);
  
  const startBlock = +block - 250;
  const endBlock = +block;
  const startHash = await api.rpc.chain.getBlockHash(startBlock).pipe(first()).toPromise();
  const endHash = await api.rpc.chain.getBlockHash(endBlock).pipe(first()).toPromise();
  
  const storage = await api.rpc.state.getStorage<Option<any>>(key, endHash).pipe(first()).toPromise();
  console.log(`Got value: ${storage.isSome ? JSON.stringify(api.createType('AccountData', storage.unwrap()), null, 2) : 'None'}`);

  const updates: any = await api.rpc.state.queryStorage([ key ], startHash, endHash).pipe(first()).toPromise();
  for (const [ hash, vals ] of updates) {
    const updatedBlock = await api.rpc.chain.getBlock(hash).pipe(first()).toPromise();
    const n = +updatedBlock.block.header.number;
    console.log(`Block ${n} (${hash}): ${vals.map((val) => (val as Option<any>).unwrapOr('None'))}`);
    const extrinsics = updatedBlock.block.extrinsics.toHuman(false);
    console.log(`Extrinsics: ${JSON.stringify(extrinsics, null, 2)}\n`);
  }
  */
}

export const queryBalances = async (api: ApiRx) => {
  const accountsData = fs.readFileSync('./accounts.json');
  const accounts = JSON.parse(accountsData).accounts;
  const zeroBals = [];
  await api.query.system.account.multi(accounts)
  .pipe(switchMap((accts: AccountId[]) => {
    accts.forEach((a, inx) => {
      if (a.toHuman()['data'].free === '0') {
        zeroBals.push(accounts[inx]);
      }
    });
    fs.writeFileSync('./zerobalss.json', zeroBals);
    return of(accounts);
  })).toPromise();
  // const res = await api.query.system.account.multi(accounts).toPromise();
  // console.log(res);
  // for (let i = 0; i < accounts.length; i++) {
  //   const sRes = await api.query.system.accounts('joqW6rXUrzdcQ8dJztJdzL9B2Tm2zedeun4mddowb31SAGp').toPromise();
  //   console.log(accounts[i], sRes);
  // }

  fs.writeFileSync('./accounts.json', accountsData);
};

export const subscribeToAccounts = (api: ApiRx, cb: Function, top: number = 2500000) => {
  return new Promise((resolve) => {
    api.rpc.chain.subscribeNewHeads().subscribe(async (header) => {
      try {
        const signedBlock = await api.rpc.chain.getBlock(header.hash).toPromise();
        if (signedBlock.block.header.number.toNumber() >= top) {
          resolve();
        } else {
          parseBlock(signedBlock, cb);  
        }
      } catch (e) {
        console.log(`Failed to parse block`);
      }
    });
  });
}

export const sampleAccounts = () => {
  const defaultMnemonic = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
  const accounts = [
    'Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Ferdie',
    'Alice//stash', 'Bob//stash', 'Charlie//stash', 'Dave//stash', 'Eve//stash', 'Ferdie//stash'
  ];
  return accounts.map(a => {
    return (new Keyring({ ss58Format: 42, type: 'sr25519' })).addFromUri(`${defaultMnemonic}//${a}`).address  
  });
}

export const genesisAccounts = (api: ApiRx) => {
  const pubKeys = [
    "0x14ad3d151938d63a4e02454f034a3158c719ed9de2e233dd0843c2d81ddba53d",
    "0x12d490251399a081935bf731184d2bf37d228bc38d3d68a8e3822933bcf23a09",
    "0xa87d1f2e04d8e95499f8a6f18214355bcb2fd2c9370ab5c19f379dd9d3167075",
    "0x4cb0922d0fb5217553da0da70bd4076812ad2a5cce860524ff7b5e6e3629f962",
    "0x78040adec849fff1c66c16ab8ac1534ed27e37a8a1da8aa3239267a883369566",
    "0xcc3d67fe87c81b5895ed89cfb1c44cc29c3798bac93368487dfc11364d6e3068",
    "0xeeb7482b9cce124538b1aeea1a7935d313b9f01cc6192fb4cc6bdf1b0f6b4430",
    "0x765e19400b3f7d44e5677d24d9914ae8cabb1bf3ef81ebc1ca72ad99d312af46",
    "0xca91588bb9258ade926d0c0631798d7e3f17c4581fae56283287d54883244a55",
    "0x1ec5e3d9a77ac81d6da0290c04d003bbcb04af8c4902bd59dbf9be4dfa47234f",
    "0xd6fb4a2f0d5dfc62c37a09e6aac5c3ea4ce2ba021f553c940e63d59dadf0cd24",
    "0x720967cda4c9097924d705695b62dfb6dc6dbeade65b5575abf5c4ca38e50503",
    "0x38a58e82baf9df6ec1f9a7064a337f872778649f3dd9002e3fe48df94b475232",
    "0xde90c8b070c0a63fbf52655af7492dc8e7d985334a4c60c02bc2f59424ff1430",
    "0x0e33e22cd22b272f388bcd41f13942d803089106ec350b8754e1d290ee6ff52b",
    "0x9665bd715c72b686c2557fe11e6cd54924adef62dc1f52cf43a503f363cf843c",
    "0x6aa8f0dd6b6221788d68bf2486126fb14bb65ea710028c11f7ca131e0df10707",
    "0x464c96a206e310511a27acc92b2e410a14bd83cb8788b522d0cee03f0d285862",
    "0xae5bfe517affa6f7456ad6b9f7465520059e6d7b2a8928673460461abb741c18",
    "0x34c71b1e42e910b94b8cbb2c960873bd4bf0db6e80afdf41cdc52acd91d6393f",
    "0x6a782c02fd24ed538224f3d0bda56146bc6bacd34f9a784c1b5367e19cda456e",
    "0xd02002915139ac3e4552c5006f92cccfbf8b02cb4d4ca1993a69d63368cc1f0c",
    "0x4864744ab79cd62cbc1094da8e6f54aba8cba7ed6d616bdd8df10572d146c15c",
    "0x143f9f9019fa62919ed6da39b8f147cb52501438e1e9e7a82d22d7b49df18e59",
    "0xa01bef9c8591ae4155f9483eee09db092fb39bdd580e3715e927333e4aa89d6d",
    "0x4e7de9c8f3564fe5cc5057de51c41b40a7da801d22c6ee5aa57f8bb2838ae857",
    "0x00e5a14e08930f94148569274ca1e9355938fabf65fffef3b7cb3c3e3edabb23",
    "0xce64070e4dffe61183241dca3e922b65ecd509430a3e283fab5c143532f79d3e",
    "0xb0492fa7ac84ecb20f9f69e1c328b521fce8f472af2cc13784286d2240e4924c",
    "0x58e8d8750021d11f5bf1106966235ed293a4288511016af7f3b2e81a84ead342",
    "0x688421b084a363cb394c5e3a7c79f44482bf2f15f6d86ea37ae110a3af238f07",
    "0x765169492c492ee29f2af9af46f9e1b117aa0283b73a4361ae12ace1c41a6c72",
    "0x6490626e3bde470c449e90b83df92ddb8514f02067a0ddd66f1080b5033dec2d",
    "0xec80b8b78a2b283f0a48712c8446241cf5f36d2f480559cdc73253981963f402",
    "0x1ec5e3d9a77ac81d6da0290c04d003bbcb04af8c4902bd59dbf9be4dfa47234f",
    "0xd6fb4a2f0d5dfc62c37a09e6aac5c3ea4ce2ba021f553c940e63d59dadf0cd24",
    "0x532cdeaeb19afd03eb4a57d4dddad09268fb720478d5386263330f5bf86f1cc4",
    "0xae5e4e8c3bbb47737a2b4abe79a71289f60271a94a5eaebf6b200f638fcbe332",
    "0x532cdeaeb19afd03eb4a57d4dddad09268fb720478d5386263330f5bf86f1cc4",
    "0x5e0755efa5da8b2bb83d2443635268b0be48ba020587fdc3731a5b87b51ff500",
    "0x720967cda4c9097924d705695b62dfb6dc6dbeade65b5575abf5c4ca38e50503",
    "0x38a58e82baf9df6ec1f9a7064a337f872778649f3dd9002e3fe48df94b475232",
    "0x89d7a1fb903a63494696c6d10d76704da7760da7f32dc3b5aa122bfba3f85680",
    "0xf272b4cdec7e979dd76c7860f7e9dd8cb1da974d74366a266c4de501b2079896",
    "0x89d7a1fb903a63494696c6d10d76704da7760da7f32dc3b5aa122bfba3f85680",
    "0xfea24c3e2b57972eead003295fcfc52fb57ffd1bdfedf1dcfb1cd35df11dcc37",
    "0xde90c8b070c0a63fbf52655af7492dc8e7d985334a4c60c02bc2f59424ff1430",
    "0x0e33e22cd22b272f388bcd41f13942d803089106ec350b8754e1d290ee6ff52b",
    "0x98a4f5d4b363447331f54328d83816f773e30799be5979c3d6d9be08f4941799",
    "0x8634c736497e74b1cedbecec7efe94bdff2ec899f60c97e003e8123f366e14e3",
    "0x98a4f5d4b363447331f54328d83816f773e30799be5979c3d6d9be08f4941799",
    "0xbce40bb0b2649d3fa924e050c603dccb5b7468f89924158e9b6d4d048c79dc23",
    "0x9665bd715c72b686c2557fe11e6cd54924adef62dc1f52cf43a503f363cf843c",
    "0x6aa8f0dd6b6221788d68bf2486126fb14bb65ea710028c11f7ca131e0df10707",
    "0x095ca61a04a9bd2fc95b31c1f86b73ef85e1388e75822896b4079cf5bc1c0e14",
    "0x98d7399dd06f0192a2eb3096aca6df6f2600634d77b92c926bed92d60c50b75d",
    "0x095ca61a04a9bd2fc95b31c1f86b73ef85e1388e75822896b4079cf5bc1c0e14",
    "0x8e84ac19afbba97a686f1b20a3288610f76177b3c71cdc1f31df0828ba6acd1c",
    "0x464c96a206e310511a27acc92b2e410a14bd83cb8788b522d0cee03f0d285862",
    "0xae5bfe517affa6f7456ad6b9f7465520059e6d7b2a8928673460461abb741c18",
    "0x76c5e8b1a4656cf7f174662674c61cb3a8fb67cee15d4f9a85f25235653c2a76",
    "0x08b8316bbc960b4e3d610724e4f330556356b567fac3a7cb63fe458dbafdf028",
    "0x76c5e8b1a4656cf7f174662674c61cb3a8fb67cee15d4f9a85f25235653c2a76",
    "0xa69f1ccc84e40afae38d2d2f87b5910b164a8b451a0d70ac51e117f1222ede65",
    "0x34c71b1e42e910b94b8cbb2c960873bd4bf0db6e80afdf41cdc52acd91d6393f",
    "0x6a782c02fd24ed538224f3d0bda56146bc6bacd34f9a784c1b5367e19cda456e",
    "0x82b6147e4e661551609f04168599ed213c21fa194aba3327fb2fd6247a52b5d2",
    "0x996b0ef45bd1f90b17ebc5f038cea21ccc1725a2c1daf3a85e774e22e173bb6e",
    "0x82b6147e4e661551609f04168599ed213c21fa194aba3327fb2fd6247a52b5d2",
    "0xbef61229205f6027e92e70bcd6b01e352c21d795e38dd64cf87335fd214d994b",
    "0xd02002915139ac3e4552c5006f92cccfbf8b02cb4d4ca1993a69d63368cc1f0c",
    "0x4864744ab79cd62cbc1094da8e6f54aba8cba7ed6d616bdd8df10572d146c15c",
    "0x3cf4ee0a14ea22e82a8953d60fc68f80a62d881e0b56c97445b3ea96adc4d31c",
    "0x2f9a90f811621556d0dd1bdf324d0154444b34a0501a9f5bd338cf41d94634f9",
    "0x3cf4ee0a14ea22e82a8953d60fc68f80a62d881e0b56c97445b3ea96adc4d31c",
    "0x4e85c095e94a47dea48c7c6824d3f4818e1c34df1e00fe658d650845c275e13e",
    "0x143f9f9019fa62919ed6da39b8f147cb52501438e1e9e7a82d22d7b49df18e59",
    "0xa01bef9c8591ae4155f9483eee09db092fb39bdd580e3715e927333e4aa89d6d",
    "0x191decd2b0b7e447a2009d0c8f963b118ee7781adada0e217273ac924514b3a8",
    "0xa81b12f94160734c3e53ac961a73c796783be50225e4e9b028e8318654f2d876",
    "0x191decd2b0b7e447a2009d0c8f963b118ee7781adada0e217273ac924514b3a8",
    "0x38fc0932145f659c13d14d4be0215b3a811738bf713c771b980032d66d10d567",
    "0x4e7de9c8f3564fe5cc5057de51c41b40a7da801d22c6ee5aa57f8bb2838ae857",
    "0x00e5a14e08930f94148569274ca1e9355938fabf65fffef3b7cb3c3e3edabb23",
    "0xd76fca327e6b6c91c220acbe0769d16ede7c96578e7743036a784fe3d528d40d",
    "0xda5bcd957592d12041bb9777605b3e3aeeac7712c2ba2339a80e33acfc5cf07e",
    "0xd76fca327e6b6c91c220acbe0769d16ede7c96578e7743036a784fe3d528d40d",
    "0xe04db33479ca34e1ee304db70edf95b37427c2350b14eff984bccc4d07e8876a",
    "0xce64070e4dffe61183241dca3e922b65ecd509430a3e283fab5c143532f79d3e",
    "0xb0492fa7ac84ecb20f9f69e1c328b521fce8f472af2cc13784286d2240e4924c",
    "0x5342c923d5c187f4417862556555ee09475c11141cbc0103272b826e0f8cd0b9",
    "0xa7a35e31a1b49a5ced7f4f6ef214da56318e7ca0dfad50274dbcb88456f35621",
    "0x5342c923d5c187f4417862556555ee09475c11141cbc0103272b826e0f8cd0b9",
    "0x504e8b32ad648f3bfaf186840421b7717af828b77b2d512a30dd6cd62060401e",
    "0xca91588bb9258ade926d0c0631798d7e3f17c4581fae56283287d54883244a55",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  ];

  return pubKeys.map(a => {
    return api.createType('AccountId', a).toString();
  });
};

export const testnetAccounts = (api: ApiRx) => {
  const pubKeys = [
    "0x3c070e2721a02249bd35a0677e1a3b1a8b9a07c25a902e7e9373b4e4d0378a54",
    "0xbedff87aaf3154ee73dae8754f9af11e033a0cbba09a8e91f4dde82d3d6bed20",
    "0xf7ccdcf57cd3ecd9e56c3324ad95a1484e6f21b0b6f3540a09ada389499cab9d",
    "0x6a1e4860a31716685e0e0f49f3333c5799bbdab5dd3bb1e674134f6f9b2be689",
    "0x6a1e4860a31716685e0e0f49f3333c5799bbdab5dd3bb1e674134f6f9b2be689",
    "0x6a1e4860a31716685e0e0f49f3333c5799bbdab5dd3bb1e674134f6f9b2be689",
    "0x628e7d34e61faa51f4aac5c400406646876c7189575d84eb6d4e4f5ecec8e672",
    "0x5002e2d414c9c0dc6753b54499077da71b8abe348ab0e745a78d1ca5e70cd752",
    "0x3e1735fcc35cf289761f00cddabc74e91a9b565b9838a205f0027e23d06e76b1",
    "0xd0c50804164d9e79b3899df678d6de83a226b581fc972f8b8bdc74070ae7e8af",
    "0xd0c50804164d9e79b3899df678d6de83a226b581fc972f8b8bdc74070ae7e8af",
    "0xd0c50804164d9e79b3899df678d6de83a226b581fc972f8b8bdc74070ae7e8af",
    "0x269ba9c9b8a209acdb1858501a649ac20ea2331a519c9104dbdda40356e3723f",
    "0x5a31704dfdb8e263a15b4af4ddd1c0b14e675377126c3bcddcb9cba0570c040f",
    "0x29041a9d8ca43fd99a9c0e2447c6d137e7ba991d8475c790cbf78744636f9915",
    "0x333e04dd11f60ebf3037e2615be6d63b01f310b920f8022fb1d6737a2c73dfa5",
    "0x333e04dd11f60ebf3037e2615be6d63b01f310b920f8022fb1d6737a2c73dfa5",
    "0x333e04dd11f60ebf3037e2615be6d63b01f310b920f8022fb1d6737a2c73dfa5",
    "0x5239cc265b2d7ac6dad6b640a28a64ce5e09b7de22fd0549c2d282d461da260e",
    "0x76a4bad1d5fe37ba60dcc9160f3b0fb1822c64f0e92f2171c358a0b7e59aef37",
    "0xd98ab5ea66c0ee4d443b3b6f896daf9c7fefb4d1d2eeca7653ffae84557cf5f3",
    "0x2f6a032ba0dbdcac7fa68607533971ba399a9a06002978b4c071f87334d153b0",
    "0x2f6a032ba0dbdcac7fa68607533971ba399a9a06002978b4c071f87334d153b0",
    "0x2f6a032ba0dbdcac7fa68607533971ba399a9a06002978b4c071f87334d153b0",
    "0x5e603412d1c84d56f590423a78050aebd3ec34e6d3bc775ca87d19216eb91911",
    "0x0266c9d3e063215ef8f35fc87ccd50489b3c6a2356aac39f89d0667145fab16b",
    "0xb6bab8caa7be249400b5062d17908c59c0e40dcbe2bd1c818098a5dae916a869",
    "0xebcde238597379c874dd51fcca5e0f651972b218c46aa21c471167474e089c86",
    "0xebcde238597379c874dd51fcca5e0f651972b218c46aa21c471167474e089c86",
    "0xebcde238597379c874dd51fcca5e0f651972b218c46aa21c471167474e089c86",
    "0xba551cfbf9e91da337f21658276dfbd56ba43be852395db10a89a64e07978f31",
    "0xec9c8c8d80eab0b1fc4733e25af31137fb656390c595bb1c7536f73b201ede57",
    "0xd1c60ddadc9a3f65da208c5c50e7fc9ed0ab069e79553d08dcc36a401948fa1a",
    "0x705c8360296c7b6af2f842e7a0804492c86a855aaa605fdf419f577f1f4fecbe",
    "0x705c8360296c7b6af2f842e7a0804492c86a855aaa605fdf419f577f1f4fecbe",
    "0x705c8360296c7b6af2f842e7a0804492c86a855aaa605fdf419f577f1f4fecbe",
    "0xf04eaed79cba531626964ba59d727b670524247c92cdd0b5f5da04c8eccb796b",
    "0x72195640f79f8254ce35db3b5d0b17c0243b0fb4489fa4b04688ed121ba22603",
    "0x80d5673f528ec827a9a1ed4bb5b47b737e9dffae3e62e95e104b4f1afc52ec68",
    "0x9878e771c7637945322a46ec58ab59ee62d0a308fc38335cbdd98c50fd0fdc41",
    "0xd0403d32c41576b2f58c91792913e32ef36549ea8668638f2803ba9021a5c540",
    "0x04fc990505c36a1725eba235594c852b8591553e2f0ff00ffc31fc47a000a564",
    "0x80a875dda00106ee48795b3f58fea60e297dce90ae8de099a767e83e37a24867",
    "0x929ff8381a23b32cbc97c789fce25b4023c521e3ef1d440d787ef1fa0924fc4f",
    "0x6d5dd00530489bddd02540f95c51b7e755442dd9ec44bb8c0abbcf4fe9efb99a",
    "0xae5725899c7bf38ee0a7676af1f9d68bd4f24c92b1311a646fa821cdd51ab92e",
    "0xbe75eba0978208a501c32f13ac9533c623bccaad0e4357c76fc02f872559762e",
    "0x7655af5c8313bc9e53c4100be0ac5fe00b028f60bb690cae9b5b6c1a1d489043",
    "0x43970f5535a774e1eaac7a92cf58a0038f424422d9d8fb9cb0ee73497a706cec",
    "0xe6cd805c1380cd03598b32e45537148190931913ec37c303196e2fd65fabe7f1",
    "0xaa8971133ee02484eabe74996452dbdca2b933431dfe19d51709c3c1d887648b",
    "0x90fea7ba6bb163d884dbdd8b2ba5b22113189c1d4944b939294b28e662ab4f17",
    "0x9cb2224f01ded140fd6ff494dc106c82715697bc83c4c6f33d58f0b3274fc214",
    "0xa2f39001e9c1dec6824d7dc7f9f4ff05e967b1dea9c884e19261c487eaeda819",
    "0x7415b2ea8dd54a86dc035bfca42e844920192614e8db17a4118f7eb3606322db",
    "0xe37cefbd9712a8848b355cd57ca23ac129a4d66de15bc476ce33fe65e6b11777",
    "0x0883d53c64d360d43b29619f11046a51ae0ab10e1a057851e00e77f6f9043b71",
    "0x9e5f5ce86bddce022c7fa7d11052117526f39fa8b9306b46a6a87e725e5f3110",
    "0xd606367a017eed18e1c179dda9eecad1bb6bfbd901ab8bb809e4a7701394c54d",
    "0xe2b32900704016d9d9375e5b673a22afa481e865e0fbc1129d3e409f7dbc8e30",
    "0x6d12ec818ed65ac5fc3e46c1e4421b7af8f61098dbfc35fed2e37a7d2946d5a3",
    "0xae250307973a96b368f1d4fef704dd8a0beb95e16b5363af5bb65e8d9de401cc",
    "0xafb6f2137d72a5c2511858bc06309918dc3fd3ab33503de10067681973755f9e",
    "0x94fec49b0b244e2bef6f0c9c4cb4c02c3b055362739bc5d4e54e7fd0525b4d04",
    "0x56a031ff9c856c605d5ef165145c7055fa5d4a236b0de3367c51ab3b6aa93a71",
    "0xd6d19faba8eb8c42c21287da2805d820b74efa60bc2703ea8e5246c84766c54d",
    "0x3b994d10cd1e052546097ae8a41cad1b2441b471f2de7917425dbe84e34160ea",
    "0xd33194e2bd13b3361ebeeb5a385a9471ec9212ae7bd5220b5b68b98535cafc09",
    "0x632a979cc1a2608bced771160eed35129ed9372e3bfa04632f8189dc32aae57d",
    "0x2ed5510d149e2de79bd6fdb9fe8688261b0931a173addd96f40e9c0877cae306",
    "0xdcfa10872cbdc30efa5a5cc14612084044c35f367ddd1ed8af5d80958ec84910",
    "0x3ade1880c7a80eadf40fe81ced4ab4d1b1cf0560d691f896352e36a756846942",
    "0x4205907674a7341551348a16cab18383fa7207c033637df2466317c0aca4876b",
    "0x6291c8f876525a3eee31d387bd55b1b4fd82a722e4006a54de404f956073c591",
    "0x3ad6d8c9a8626eff2df6f455976db799b0f1d4524eb00b11768a8513422dc864",
    "0x12e5b5d715ac0b6dc3f0b2e6f1fb2dee57e8b595bbbd621020ea63ce038aa94c",
    "0xe48f98d4bbcafbdd0c4684c4606a2c584abc35d0e186ab8d045aeceabe1c6c4b",
    "0x5247cdd57825d2bd7922c582c7c073e97387083a4a5cd0d1ea095fa20ac8393a",
    "0xb750fafb7f16e02617b58c2c4a8fc94fff3934bbd5361a78c4f0c9d4e688b3e0",
    "0x7155fcc6466f89e331c174c656258ac9701ca4290e0fd06383e61336bbc18b1a",
    "0x2727f5f65caab717de55fcff8871e51951391bd15f46f74404479ffbd155fb51",
    "0x705277403dcdb765fd68b6a0db71ade446189f5b1e047be6228af51a6fa39c34",
    "0x186a149dbd823f37a1d98cc55f61ad06832e2154b48457cc5cb80452014aff5c",
    "0x24f65879dee07a7a91ada9e8a024824c5b32af27687d796e40eeb0ca666eef6a",
    "0x1da90a0ef8a500510e68ab4713837ac0da1b05b38538fd20a157e3bb5b1d6603",
    "0x9fd89819442f21949c3f5915dbe961219de42e32947c47669d89fb8b26e5360c",
    "0x614f8583a6006053ea5529331c3d92603e716398311e899d9137b4c26b70a826",
    "0x3aec8b7baf0e520fc91b73e8e78d69ce4232bb23ed08def718dd040a396b7712",
    "0x9834b2fa930a67ccdab7dbbfb4fcf74416f0fc8c5658f67fe2e3feccf553566d",
    "0x86347d327bd5991a471c0eee25a7dab54bf4f441e4aed1ca59f41efae5eaa128",
    "0xba7b5b18baa2fcf8b0aa3f1923a417ffefd3c909005ce530a37fb42abeb3bbb4",
    "0x4f119bac5db308398feaaba7f16c25cbe26f6bb99b1a72b04d4ebb649d6151dc",
    "0xf620a289821496f9ffdca490a5a457da493ebadde242fea7a38b4fd1340040a2",
    "0xa4a20f07d64813595efe5fe6f31627d7386e3673f380b9a1f319b3c168573717",
    "0x92c8abefa9fe6c8ee91acea87143436e44095f8252630c175feefdb18e3fb73c",
    "0x3279738232083ef63a8f7005916b677aac0efca0d71a9d26cce613b2f58f6d23",
    "0x66317ac47aae3c8e8fcdecee852a968be931a89bd9a146d9bb16b345d98b6d1d",
    "0x64838c72edccba1a0d3ec703a123257e442a82380e8403a316cbdb90123138a4",
    "0xf1a07551ad066eebd0193cf55e619836dce1dbb9dfda2d9405072eac9031bf9f",
    "0xa245ab29c25d4e12af0c91bc65f6c72d6ab9b834acd4364576362575077bbd37",
  ];

  return pubKeys.map(a => {
    return api.createType('AccountId', a).toString();
  });
};