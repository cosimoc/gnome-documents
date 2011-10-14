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

const _ = imports.gettext.gettext;

const Global = imports.global;
const Manager = imports.manager;

const StockCategories = {
    RECENT: 'recent',
    FAVORITES: 'favorites',
    SHARED: 'shared',
    PRIVATE: 'private'
};

function Category(params) {
    this._init(params);
};

Category.prototype = {
    _init: function(params) {
        this.id = params.id;
        this.name = params.name;
        this.icon = params.icon;
    },

    getWhere: function() {
        if (this.id == StockCategories.FAVORITES)
            return '{ ?urn nao:hasTag nao:predefined-tag-favorite }';

        // require to have a contributor, and creator, and they should be different
        if (this.id == StockCategories.SHARED)
            return '{ ?urn nco:contributor ?contributor . ?urn nco:creator ?creator FILTER (?contributor != ?creator ) }';

        return '';
    },

    getFilter: function() {
        // require to be not local
        if (this.id == StockCategories.SHARED)
            return Global.queryBuilder.buildFilterNotLocal();

        return '(true)';
    }
};

function CategoryManager() {
    this._init();
};

CategoryManager.prototype = {
    __proto__: Manager.BaseManager.prototype,

    _init: function() {
        Manager.BaseManager.prototype._init.call(this);

        let category, recent;
        // Translators: this refers to new and recent documents
        recent = new Category({ id: StockCategories.RECENT,
                                name: _("New and Recent"),
                                icon: '' });
        this.addItem(recent);

        // Translators: this refers to favorite documents
        category = new Category({ id: StockCategories.FAVORITES,
                                  name: _("Favorites"),
                                  icon: 'emblem-favorite-symbolic' });
        this.addItem(category);
        // Translators: this refers to shared documents
        category = new Category({ id: StockCategories.SHARED,
                                  name: _("Shared with you"),
                                  icon: 'emblem-shared-symbolic' });
        this.addItem(category);

        // Private category: currently unimplemented
        // category = new Category(StockCategories.PRIVATE, _("Private"), 'channel-secure-symbolic');
        // this._categories[category.id] = category;

        this.setActiveItem(recent);
    },

    getActiveCategoryFilter: function() {
        let active = this.getActiveItem();
        return active.getFilter();
    }
};
Signals.addSignalMethods(CategoryManager.prototype);
