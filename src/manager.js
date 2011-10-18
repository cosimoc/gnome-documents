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

function BaseManager() {
    this._init();
};

BaseManager.prototype = {
    _init: function() {
        this._items = {};
        this._activeItem = null;
    },

    getItemById: function(id) {
        let retval = this._items[id];

        if (!retval)
            retval = null;

        return retval;
    },

    addItem: function(item) {
        this._items[item.id] = item;
        this.emit('item-added', item);
    },

    setActiveItem: function(item) {
        if (!item)
            return false;

        if (item != this._activeItem) {
            this._activeItem = item;
            this.emit('active-changed', this._activeItem);

            return true;
        }

        return false;
    },

    setActiveItemById: function(id) {
        let item = this.getItemById(id);
        return this.setActiveItem(item);
    },

    getItems: function() {
        return this._items;
    },

    getItemsCount: function() {
        return Object.keys(this._items).length;
    },

    getActiveItem: function() {
        return this._activeItem;
    },

    removeItem: function(item) {
        this.removeItemById(item.id);
    },

    removeItemById: function(id) {
        let item = this._items[id];

        if (item) {
            delete this._items[id];
            this.emit('item-removed', item);
        }
    },

    clear: function() {
        this._items = {};
        this._activeItem = null;
    },

    getFilter: function() {
        let item = this.getActiveItem();
        if (item && item.getFilter())
            return item.getFilter();

        return '';
    },

    processNewItems: function(newItems) {
        let oldItems = this.getItems();

        for (idx in oldItems) {
            let item = oldItems[idx];

            // if old items are not found in the new array,
            // remove them
            if (!newItems[idx] && !item.builtin)
                this.removeItem(oldItems[idx]);
        }

        for (idx in newItems) {
            // if new items are not found in the old array,
            // add them
            if (!oldItems[idx])
                this.addItem(newItems[idx]);
        }

        // TODO: merge existing item properties with new values
    }
};
Signals.addSignalMethods(BaseManager.prototype);
