## Setup instructions

### 1. Install packages
```
yarn install
```

### 2. Update environement variables
1. you will need to add 2 more address in your sandbox see .env.example.
2. Copy `.env.example` to `.env`.
3. Update credentials in `.env` file.
4. then do the commande `source .env`

### 3. Algo Builder deployment commands

# Clear cache
yarn run algob clean

# Run one deployment script
yarn run algob deploy scripts/<filename>
OR 
yarn run algob deploy

# Run tests
yarn run algob test


### 4. Copy the deployed checkpoint files to src folder
```
cp artifacts/scripts/<filename>.yaml src/artifacts/
```

### 5. Run the Dapp
```
yarn serve
```

once you will connect to algosigner you will get all 4 address in dapp to navigate between account all along with the disconnect button!!!




