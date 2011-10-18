/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Lang = imports.lang;
const Signals = imports.signals;

const Global = imports.global;
const Manager = imports.manager;

const CollectionQueryColumns = {
    URN: 0,
    NAME: 1
};

function Collection(params) {
    this._init(params);
};

Collection.prototype = {
    _init: function(params) {
        if (params.cursor) {
            let cursor = params.cursor;

            this.id = cursor.get_string(CollectionQueryColumns.URN)[0];
            this.name = cursor.get_string(CollectionQueryColumns.NAME)[0];
        }

        // TODO add icon for remote categories
        this.icon = '';
    },

    getWhere: function() {
        return '{ ?urn nie:isPartOf <' + this.id + '> }';
    }
};
Signals.addSignalMethods(Collection.prototype);

function CollectionManager() {
    this._init();
};

CollectionManager.prototype = {
    __proto__: Manager.BaseManager.prototype,

    _init: function() {
        Manager.BaseManager.prototype._init.call(this);
        this._newItems = {};
        this._currentQuery = null;

        // we want to only display collections for the current source,
        // so refresh the list when the active source changes.
        Global.sourceManager.connect('active-changed',
                                     Lang.bind(this, this._refreshCollections));

        this._refreshCollections();

        // TODO: keep track changes from the tracker store
    },

    _refreshCollections: function() {
        this._currentQuery = Global.queryBuilder.buildCollectionsQuery();
        Global.connection.query_async(this._currentQuery.sparql, null, Lang.bind(this,
            function(object, res) {
                try {
                    let cursor = object.query_finish(res);
                    cursor.next_async(null, Lang.bind(this, this._onCursorNext));
                } catch (e) {
                    log('Unable to query the collection list: ' + e.toString());
                }
            }));
    },

    _onCursorNext: function(cursor, res) {
        try {
            let valid = cursor.next_finish(res);

            if (valid) {
                this._addCollectionFromCursor(cursor);
                cursor.next_async(null, Lang.bind(this, this._onCursorNext));
            } else {
                // process all the items we collected
                cursor.close();
                this._refreshItems();
            }
        } catch (e) {
            log('Unable to query the collection list: ' + e.toString());
            cursor.close();
            this._refreshItems();
        }
    },

    _refreshItems: function() {
        this.processNewItems(this._newItems);
        this._newItems = {};
    },

    _addCollectionFromCursor: function(cursor) {
        let collection = new Collection({ cursor: cursor });
        this._newItems[collection.id] = collection;
    }
};
