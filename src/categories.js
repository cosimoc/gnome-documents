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

function Category(id, name, icon) {
    this._init(id, name, icon);
};

Category.prototype = {
    _init: function(id, name, icon) {
        this.id = id;
        this.name = name;
        this.icon = icon;
    },

    getFilter: function() {
        if (this.id == 'favorites')
            return '{ ?urn nao:hasTag nao:predefined-tag-favorite }';

        return '';
    }
};

function CategoryManager() {
    this._init();
};

CategoryManager.prototype = {
    _init: function() {
        this.categories = [];

        this.categories.push(new Category('recent', _("New and Recent"), ''));

        this.categories.push(new Category('favorites', _("Favorites"), 'emblem-favorite-symbolic'));
        this.categories.push(new Category('private', _("Private"), 'channel-secure-symbolic'));
        this.categories.push(new Category('shared', _("Shared with you"), 'emblem-shared-symbolic'));

        this.setActiveCategoryId('recent');
    },

    setActiveCategoryId: function(id) {
        let matched = this.categories.filter(Lang.bind(this,
            function(category) {
                return (category.id == id);
            }));

        if (!matched.length)
            return;

        this.activeCategory = matched[0];

        this.emit('active-category-changed');
    },

    getActiveCategoryId: function() {
        return this.activeCategory.id;
    },

    getActiveCategoryFilter: function() {
        return this.activeCategory.getFilter();
    }
};
Signals.addSignalMethods(CategoryManager.prototype);
