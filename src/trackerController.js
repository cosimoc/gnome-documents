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

const DBus = imports.dbus;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const GDataMiner = imports.gDataMiner;
const Global = imports.global;
const Query = imports.query;
const Utils = imports.utils;

const MINER_REFRESH_TIMEOUT = 60; /* seconds */

function TrackerController() {
    this._init();
}

TrackerController.prototype = {
    _init: function() {
        // startup a refresh of the gdocs cache
        this._miner = new GDataMiner.GDataMiner();
        this._refreshMinerNow();

        this._sourceManager = Global.sourceManager;
        this._sourceManager.connect('sources-changed',
                                    Lang.bind(this, this._refresh));
        this._sourceManager.connect('active-source-changed',
                                    Lang.bind(this, this._refresh));

        this._offsetController = Global.offsetController;
        this._offsetController.connect('offset-changed',
                                       Lang.bind(this, this._performCurrentQuery));

        Global.searchFilterController.connect('changed',
                                              Lang.bind(this, this._onSearchFilterChanged));

        // perform initial query
        this._refresh();
    },

    _refreshMinerNow: function() {
        this._miner.RefreshDBRemote(DBus.CALL_FLAG_START, Lang.bind(this,
            function(res, error) {
                if (error) {
                    log('Error updating the GData cache: ' + error.toString());
                    return;
                }

                Mainloop.timeout_add_seconds(MINER_REFRESH_TIMEOUT,
                                             Lang.bind(this, this._refreshMinerNow));
            }));

        return false;
    },

    _onQueryFinished: function(exception) {
        Global.selectionController.freezeSelection(false);

        if (exception)
            Global.errorHandler.addQueryError(exception);
    },

    _onCursorNext: function(cursor, res) {
        try {
            let valid = cursor.next_finish(res);

            if (!valid) {
                // signal the total count update and return
                cursor.close();
                this._onQueryFinished(null);
                return;
            }
        } catch (e) {
            cursor.close();
            this._onQueryFinished(e);
            return;
        }

        Global.documentManager.addDocument(cursor);
        cursor.next_async(null, Lang.bind(this, this._onCursorNext));
    },

    _onQueryExecuted: function(object, res) {
        try {
            let cursor = object.query_finish(res);
            cursor.next_async(null, Lang.bind(this, this._onCursorNext));
        } catch (e) {
            this._onQueryFinished(e);
        }
    },

    _performCurrentQuery: function() {
        Global.connection.query_async(Global.queryBuilder.buildGlobalQuery(),
                                      null, Lang.bind(this, this._onQueryExecuted));
    },

    _refresh: function() {
        Global.selectionController.freezeSelection(true);
        Global.documentManager.clear();
        this._offsetController.resetItemCount();

        this._performCurrentQuery();
    },

    _onSearchFilterChanged: function() {
        this._offsetController.resetOffset();
        this._refresh();
    }
};
Signals.addSignalMethods(TrackerController.prototype);
