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

const CollectionQueryColumns = {
    URN: 0,
    NAME: 1
};

function Collection(params) {
    this._init(params);
};

Collection.prototype = {
    _init: function(params) {
        this.urn = null;
        this.name = null;

        if (params.cursor) {
            let cursor = params.cursor;

            this.urn = cursor.get_string(CollectionQueryColumns.URN)[0];
            this.name = cursor.get_string(CollectionQueryColumns.NAME)[0];
        }
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
    _init: function() {
        this._collections = {};

        let sparql = 'SELECT ?urn nie:title(?urn) WHERE { ' +
            '{ ?urn a nfo:DataContainer } ' +
            '{ ?doc nie:isPartOf ?urn } ' +
            'FILTER ((fn:starts-with (nao:identifier(?urn), "gd:collection"))' +
            ')}';

        Global.connection.query_async(sparql, null, Lang.bind(this,
            function(object, res) {
                try {
                    let cursor = object.query_finish(res);
                    cursor.next_async(null, Lang.bind(this, this._onCursorNext));
                } catch (e) {
                    log('Unable to query the collection list: ' + e.toString());
                }
            }));
    },

    _onChangesPending: function() {

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
            }
        } catch (e) {
            log('Unable to query the collection list: ' + e.toString());
            cursor.close();
        }
    },

    _addCollectionFromCursor: function(cursor) {
        let urn = cursor.get_string(CollectionQueryColumns.URN)[0];
        let collection = this.getCollectionByUrn(urn);

        if (collection != null) {
            collection.updateFromCursor(cursor);
        } else {
            collection = new Collection({ cursor: cursor });
            this._addCollection(collection);
        }
    },

    _addCollection: function(collection) {
        this._collections[collection.urn] = collection;
        this.emit('collection-added', collection);
    },

    getCollections: function() {
        return this._collections;
    },

    getCollectionByUrn: function(urn) {
        let retval = this._collections[urn];

        if (!retval)
            retval = null;

        return retval;
    }
};
Signals.addSignalMethods(CollectionManager.prototype);
