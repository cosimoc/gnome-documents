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
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const Global = imports.global;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const _OFFSET_STEP = 50;

function OffsetController() {
    this._init();
};

OffsetController.prototype = {
    _init: function() {
        this._offset = 0;
        this._itemCount = 0;
    },

    // to be called by the view
    increaseOffset: function() {
        this._offset += _OFFSET_STEP;
        this.emit('offset-changed', this._offset);
    },

    // to be called by the model
    resetItemCount: function() {
        let query = Global.queryBuilder.buildCountQuery();

        Global.connectionQueue.add
            (query.sparql, null, Lang.bind(this,
                function(object, res) {
                    let cursor = null;
                    try {
                        cursor = object.query_finish(res);
                    } catch (e) {
                        log('Unable to execute count query: ' + e.toString());
                        return;
                    }

                    cursor.next_async(null, Lang.bind(this,
                        function(object, res) {
                            let valid = object.next_finish(res);

                            if (valid) {
                                this._itemCount = cursor.get_integer(0);
                                this.emit('item-count-changed', this._itemCount);
                            }

                            cursor.close();
                        }));
                }));
    },

    // to be called by the model
    resetOffset: function() {
        this._offset = 0;
    },

    getRemainingDocs: function() {
        return (this._itemCount - (this._offset + _OFFSET_STEP));
    },

    getOffsetStep: function() {
        return _OFFSET_STEP;
    },

    getOffset: function() {
        return this._offset;
    }
};
Signals.addSignalMethods(OffsetController.prototype);
