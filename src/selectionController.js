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

const Signals = imports.signals;

function SelectionController() {
    this._init();
};

SelectionController.prototype = {
    _init: function() {
        this._selection = [];
    },

    setSelection: function(selection) {
        if (this._isFreezed)
            return;

        this._selection = selection;
        this.emit('selection-changed', this._selection);
    },

    getSelection: function() {
        return this._selection;
    },

    freezeSelection: function(freeze) {
        if (freeze == this._isFreezed)
            return;

        this._isFreezed = freeze;

        if (!this._isFreezed)
            this.emit('selection-check');
    }
};
Signals.addSignalMethods(SelectionController.prototype);
