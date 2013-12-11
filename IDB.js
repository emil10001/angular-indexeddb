'use strict';

/**
 *
 * options = {
 *  storeName : 'your store name',
 *  keyPath : 'inline key',
 *  indexes : [{ name : 'indexName', unique : 'true/false' },{},...]
 * }
 *
 * ------ OR -------
 *
 * options = [{
 *  storeName : 'your store name',
 *  keyPath : 'inline key',
 *  indexes : [{ name : 'indexName', unique : 'true/false' },{},...]
 * }, {
 *  storeName : 'your second store name',
 *  keyPath : 'inline key',
 *  indexes : [{ name : 'indexName', unique : 'true/false' },{},...]
 * }]
 *
 */

angular.module('angular-indexeddb', [ 'ngResource' ])
    .service('IDB', function ($rootScope) {
        var self = this;

        // this is pretty basic stuff for opening up an IndexedDB database
        // there is a little bit added here to set the options up properly, 
        // and handle an array of options
        this.openDB = function(dbName, version, options) {
            this.dbName = dbName;
            this.version = version;
            this.db = null;
            this.objectStore = null;
            this.options = {};
            if (options instanceof Array) {
                for (var i = 0; i < options.length; i++) {
                    this.options[options[i].storeName] = options[i];
                }
            } else {
                this.options[options.storeName] = options;
            }
            console.log('options', this.options);

            var request;
            // you should always specify a version
            // I don't think that this method will even work correctly without one
            if (!!this.version)
                request = indexedDB.open(this.dbName, this.version);
            else
                request = indexedDB.open(this.dbName);

            // handle the failure case
            request.onerror = function (event) {
                console.log('failed to open db ' + event);
                self.failure();
            };
            // handle the upgrade case
            request.onupgradeneeded = function (event) {
                console.log('idb upgrade');
                var db = event.target.result;
                this.db = db;
                var opKeys = Object.keys(this.options);
                // we want to step through the options objects
                // the db needs to know about all keys and indexes in a store
                for (var i = 0; i < opKeys.length; i++) {
                    var options = this.options[opKeys[i]];
                    var objectStore;

                    if (!this.db.objectStoreNames.contains(options.storeName)) {
                        if (!!options.keyPath)
                            objectStore = db.createObjectStore(options.storeName, {keyPath: options.keyPath});
                        else
                            objectStore = db.createObjectStore(options.storeName);
                    } else {
                        objectStore = event.currentTarget.transaction.objectStore(options.storeName);
                    }
                    if (!!options.indexes) {
                        for (var j = 0; j < options.indexes.length; j++) {
                            var indexName = options.indexes[j].name;
                            var indexData = options.indexes[j];

                            if (objectStore.indexNames.contains(indexName)) {
                                // check if it complies
                                var actualIndex = objectStore.index(indexName);
                                var complies = indexComplies(actualIndex, indexData);
                                if (!complies) {
                                    objectStore.deleteIndex(indexName);
                                    objectStore.createIndex(indexName, indexName, { unique: indexData.unique });
                                }
                            } else {
                                objectStore.createIndex(indexName, indexName, { unique: indexData.unique });
                            }
                        }
                    }
                }
                $rootScope.$emit('dbopenupgrade', [this.dbName, event.target.transaction]);
            }.bind(this);
            // the success case!
            request.onsuccess = function (event) {
                this.db = event.target.result;
                console.log('idb success', this, this.db);
                // $rootScope.$emit is AngularJS's event emitter
                $rootScope.$emit('dbopen', [this.dbName]);
            }.bind(this);

        }

        this.failure = function () {
            $rootScope.$emit('failure');
        };
        this.success = function () {
            $rootScope.$emit('success');
        };
        this.test = function () {
            console.log('idb test');
        };

        // https://github.com/jensarps/IDBWrapper/blob/master/idbstore.js
        function indexComplies(actual, expected) {
            return ['keyPath', 'unique', 'multiEntry'].every(function (key) {
                // IE10 returns undefined for no multiEntry
                if (key == 'multiEntry' && actual[key] === undefined && expected[key] === false) {
                    return true;
                }
                return expected[key] == actual[key];
            });
        }

        // a quick and simple wrapper for getting the transaction store with an optional mode
        this.getTransactionStore = function (storeName, mode) {
            if (!(this.db instanceof IDBDatabase)) {
                console.log('db', this, this.db);
                throw 'missing database error!';
            }

            if (typeof mode !== 'string')
                return this.db.transaction(storeName).objectStore(storeName);
            else
                return this.db.transaction(storeName, mode).objectStore(storeName);
        };

        this.getItemOnIndex = function (storeName, index, key) {
            var boundKeyRange = IDBKeyRange.only(key);

            var cursorRequest = this.getTransactionStore(storeName)
                .index(index).openCursor(boundKeyRange);

            cursorRequest.onsuccess = function (event) {
                var cursor = cursorRequest.result || event.result;
                if (cursor) {
                    $rootScope.$emit('getitem', [self.dbName, storeName, cursor.value]);
                }
                else {
                    console.log('no cursor');
                    self.failure();
                }
            };
            cursorRequest.onerror = self.failure;
        };

        this.getItemsOnIndex = function (storeName, index, key) {
            var boundKeyRange = IDBKeyRange.only(key);

            var cursorRequest = this.getTransactionStore(storeName)
                .index(index).openCursor(boundKeyRange, "next");

            var results = [];

            cursorRequest.onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                }
                else {
                    $rootScope.$emit('getitem', [self.dbName, storeName, results]);
                }
            };
            cursorRequest.onerror = self.failure;
        };

        this.getItemsOnIndexWithTransaction = function (transaction, storeName, index, key) {
            var boundKeyRange = IDBKeyRange.only(key);

            var cursorRequest = transaction.objectStore(storeName)
                .index(index).openCursor(boundKeyRange, "next");

            var results = [];

            cursorRequest.onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                }
                else {
                    $rootScope.$emit('getitem', [self.dbName, storeName, results]);
                }
            };
            cursorRequest.onerror = self.failure;
        };

        // for simple get requests by key
        this.getItem = function (storeName, key) {
            var getRequest = this.getTransactionStore(storeName).get(key);

            getRequest.onsuccess = function (event) {
                $rootScope.$emit('getitem', [self.dbName, storeName, event.target.result]);
            };
            getRequest.onerror = self.failure;
        };

        // we're just going to get everything from a given data store
        this.getInit = function (transaction, storeName) {
            var objectStore = transaction.objectStore(storeName);
            var results = [];

            objectStore.openCursor().onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                }
                else {
                    $rootScope.$emit('getinit', [self.dbName, storeName, results]);
                }
            };
            objectStore.onerror = self.failure;
        };

        // similar to getInit, but we don't have a transaction to pass in
        this.getAll = function (storeName) {
            var objectStore = this.getTransactionStore(storeName);
            var results = [];

            objectStore.openCursor().onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                }
                else {
                    $rootScope.$emit('getall', [self.dbName, storeName, results]);
                }
            };
            objectStore.onerror = self.failure;
        };

        this.remove = function (storeName, key) {
            var request = this.getTransactionStore(storeName, "readwrite").delete(key);
            request.onsuccess = function (event) {
                $rootScope.$emit('remove', [self.dbName, storeName]);
            };
            request.onerror = self.failure;
        };

        this.removeItemsOnIndex = function (storeName, index, key, key_path) {
            var boundKeyRange = IDBKeyRange.only(key);

            var transactionStore = this.getTransactionStore(storeName, "readwrite");
            var cursorRequest = transactionStore.index(index).openCursor(boundKeyRange, "next");

            cursorRequest.onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    var request = transactionStore.delete(cursor.value[key_path]);
                    ;
                    request.onsuccess = self.success;
                    request.onerror = self.failure;

                    cursor.continue();
                }
                else {
                    $rootScope.$emit('remove', [self.dbName, storeName]);
                }
            }.bind(transactionStore);
            cursorRequest.onerror = self.failure;
        };


        this.put = function (storeName, data) {
            console.log('IDB put');
            var request = this.getTransactionStore(storeName, "readwrite").put(data);
            request.onsuccess = function (event) {
                $rootScope.$emit('put', [self.dbName, storeName]);
            };
            request.onerror = self.failure;
        };

        this.removeAll = function (storeName) {
            console.log('IDB put');
            var request = this.getTransactionStore(storeName, "readwrite").clear();
            request.onsuccess = function (event) {
                $rootScope.$emit('clear', [self.dbName, storeName]);
            };
            request.onerror = self.failure;
        };


        // data should be an array of objects to be inserted
        this.batchInsert = function (storeName, data) {
            console.log('IDB batchInsert');
            var objectStore = this.getTransactionStore(storeName, "readwrite");

            var i = 0;
            var putNext = function () {
                if (i < data.length) {
                    var request = objectStore.put(data[i]);
                    request.onsuccess = putNext;
                    request.onerror = self.failure;
                    ++i;
                } else {
                    console.log('populate complete');
                    $rootScope.$emit('batchinsert', [self.dbName, storeName]);
                }
            };

            putNext();
        };

    });


