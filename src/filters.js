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

const Global = imports.global;

function SearchFilterController() {
    this._init();
};

SearchFilterController.prototype = {
    _init: function() {
        this._searchVisible = false;
        this._searchIn = false;
        this._dropdownState = false;
        this._string = '';
    },

    setString: function(string) {
        if (this._string == string)
            return;

        this._string = string;
        this.emit('search-string-changed', this._string);
    },

    getString: function() {
        return this._string;
    },

    setDropownState: function(state) {
        if (this._dropdownState == state)
            return;

        this._dropdownState = state;
        this.emit('search-dropdown-changed', this._dropdownState);
    },

    getDropdownState: function() {
        return this._dropdownState;
    },

    setSearchVisible: function(visible) {
        if (this._searchVisible == visible)
            return;

        this._searchVisible = visible;
        this.emit('search-visible-changed', this._searchVisible);

        if (!this._searchVisible)
            this.setDropownState(false);
    },

    getSearchVisible: function() {
        return this._searchVisible;
    },

    setSearchIn: function(setting) {
        if (this._searchIn == setting)
            return;

        this._searchIn = setting;
        this.emit('search-in-changed', this._searchIn);
    },

    getSearchIn: function() {
        return this._searchIn;
    },

    deliverEvent: function(event) {
        this.emit('deliver-event', event);
    }
};
Signals.addSignalMethods(SearchFilterController.prototype);

function SideFilterController() {
    this._init();
}

SideFilterController.prototype = {
    _init: function() {
        // intialize to last category
        this._whereItem = Global.categoryManager.getActiveItem();

        this._sidebarVisible = true;
    },

    setActiveItem: function(controller, item) {
        if (this._whereItem == item)
            return;

        this._whereItem = item;
        controller.setActiveItem(this._whereItem);

        this.emit('changed', this._whereItem);
    },

    setSidebarVisible: function(visible) {
        if (this._sidebarVisible == visible)
            return;

        this._sidebarVisible = visible;
        this.emit('sidebar-visible-changed', this._sidebarVisible);
    },

    getSidebarVisible: function() {
        return this._sidebarVisible;
    },

    getWhere: function() {
        if (!this._whereItem)
            return '';

        return this._whereItem.getWhere();
    },

    getWhereItem: function() {
        return this._whereItem;
    }
};
Signals.addSignalMethods(SideFilterController.prototype);
