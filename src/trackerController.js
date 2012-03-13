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
const Query = imports.query;
const Utils = imports.utils;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const QueryType = {
    SELECT: 0,
    UPDATE: 1,
    UPDATE_BLANK: 2
};

function TrackerConnectionQueue() {
    this._init();
}

TrackerConnectionQueue.prototype = {
    _init: function() {
        this._queue = [];
        this._running = false;
    },

    add: function(query, cancellable, callback) {
        let params = { query: query,
                       cancellable: cancellable,
                       callback: callback,
                       queryType: QueryType.SELECT };
        this._queue.push(params);

        this._checkQueue();
    },

    update: function(query, cancellable, callback) {
        let params = { query: query,
                       cancellable: cancellable,
                       callback: callback,
                       queryType: QueryType.UPDATE };
        this._queue.push(params);

        this._checkQueue();
    },

    updateBlank: function(query, cancellable, callback) {
        let params = { query: query,
                       cancellable: cancellable,
                       callback: callback,
                       queryType: QueryType.UPDATE_BLANK };
        this._queue.push(params);

        this._checkQueue();
    },

    _checkQueue: function() {
        if (this._running)
            return;

        if (!this._queue.length)
            return;

        let params = this._queue.shift();
        this._running = true;

        if (params.queryType == QueryType.SELECT)
            Global.connection.query_async(params.query, params.cancellable,
                                          Lang.bind(this, this._queueCollector, params));
        else if (params.queryType == QueryType.UPDATE)
            Global.connection.update_async(params.query, GLib.PRIORITY_DEFAULT, params.cancellable,
                                           Lang.bind(this, this._queueCollector, params));
        else if (params.queryType == QueryType.UPDATE_BLANK)
            Global.connection.update_blank_async(params.query, GLib.PRIORITY_DEFAULT, params.cancellable,
                                                 Lang.bind(this, this._queueCollector, params));
    },

    _queueCollector: function(connection, res, params) {
        params.callback(connection, res);
        this._running = false;
        this._checkQueue();
    }
};

const RefreshFlags = {
    NONE: 0,
    RESET_OFFSET: 1 << 0
};

function TrackerController() {
    this._init();
}

TrackerController.prototype = {
    _init: function() {
        this._currentQuery = null;
        this._cancellable = new Gio.Cancellable();
        this._queryQueued = false;
        this._queryQueuedFlags = RefreshFlags.NONE;
        this._querying = false;
        this._isStarted = false;

        // useful for debugging
        this._lastQueryTime = 0;

        this._sourceManager = Global.sourceManager;
        this._sourceManager.connect('item-added', Lang.bind(this, this._onSourceAddedRemoved));
        this._sourceManager.connect('item-removed', Lang.bind(this, this._onSourceAddedRemoved));
        this._sourceManager.connect('active-changed',
                                    Lang.bind(this, this._refreshForObject));

        this._offsetController = Global.offsetController;
        this._offsetController.connect('offset-changed',
                                       Lang.bind(this, this._performCurrentQuery));

        Global.collectionManager.connect('active-changed',
                                         Lang.bind(this, this._refreshForObject));
        Global.searchController.connect('search-string-changed',
                                        Lang.bind(this, this._refreshForObject));
        Global.searchCategoryManager.connect('active-changed',
                                             Lang.bind(this, this._refreshForObject));
        Global.searchTypeManager.connect('active-changed',
                                         Lang.bind(this, this._refreshForObject));

        Global.searchMatchManager.connect('active-changed',
                                          Lang.bind(this, this._onSearchMatchChanged));
    },

    _setQueryStatus: function(status) {
        if (this._querying == status)
            return;

        if (status) {
            this._lastQueryTime = GLib.get_monotonic_time();
        } else {
            Utils.debug('Query Elapsed: '
                        + (GLib.get_monotonic_time() - this._lastQueryTime) / 1000000);
            this._lastQueryTime = 0;
        }

        this._querying = status;
        this.emit('query-status-changed', this._querying);
    },

    getQueryStatus: function() {
        return this._querying;
    },

    _onQueryFinished: function(exception) {
        this._setQueryStatus(false);

        if (exception)
            Global.errorHandler.addQueryError(exception);
        else
            this._offsetController.resetItemCount();

        if (this._queryQueued) {
            this._queryQueued = false;
            this._refreshInternal(this._queryQueuedFlags);
        }
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

        Utils.debug('Query Cursor: '
                    + (GLib.get_monotonic_time() - this._lastQueryTime) / 1000000);
        Global.documentManager.addDocumentFromCursor(cursor);
        cursor.next_async(this._cancellable, Lang.bind(this, this._onCursorNext));
    },

    _onQueryExecuted: function(object, res) {
        try {
            Utils.debug('Query Executed: '
                        + (GLib.get_monotonic_time() - this._lastQueryTime) / 1000000);

            let cursor = object.query_finish(res);
            cursor.next_async(this._cancellable, Lang.bind(this, this._onCursorNext));
        } catch (e) {
            this._onQueryFinished(e);
        }
    },

    _performCurrentQuery: function() {
        this._currentQuery = Global.queryBuilder.buildGlobalQuery();
        this._cancellable.reset();

        Global.connectionQueue.add(this._currentQuery.sparql,
                                   this._cancellable, Lang.bind(this, this._onQueryExecuted));
    },

    _refreshInternal: function(flags) {
        this._isStarted = true;

        if (flags & RefreshFlags.RESET_OFFSET)
            Global.offsetController.resetOffset();

        if (this.getQueryStatus()) {
            this._cancellable.cancel();
            this._queryQueued = true;
            this._queryQueuedFlags = flags;

            return;
        }

        this._setQueryStatus(true);
        Global.documentManager.clear();

        this._performCurrentQuery();
    },

    _refreshForObject: function(_object, _item) {
        this._refreshInternal(RefreshFlags.RESET_OFFSET);
    },

    _onSearchMatchChanged: function() {
        // when the "match" search setting changes, refresh only if
        // the search string is not empty
        if (Global.searchController.getString() != '')
            this._refreshInternal(RefreshFlags.RESET_OFFSET);
    },

    _onSourceAddedRemoved: function(manager, item) {
        // When a source is added or removed, refresh the model only if
        // the current source is All.
        // If it was the current source to be removed, we will get an
        // 'active-changed' signal, so avoid refreshing twice
        if (this._currentQuery.activeSource &&
            this._currentQuery.activeSource.id == 'all')
            this._refreshInternal(RefreshFlags.NONE);
    },

    start: function() {
        if (this._isStarted)
            return;

        this._refreshInternal(RefreshFlags.NONE);
    }
};
Signals.addSignalMethods(TrackerController.prototype);
