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

const Gd = imports.gi.Gd;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const Lang = imports.lang;
const Signals = imports.signals;

function BaseManager(title) {
    this._init(title);
};

BaseManager.prototype = {
    _init: function(title) {
        this._items = {};
        this._activeItem = null;
        this._title = null;

        if (title)
            this._title = title;
    },

    getTitle: function() {
        return this._title;
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
        let retval = '';

        if (item.id == 'all')
            retval = this._getAllFilter();
        else if (item && item.getFilter)
            retval = item.getFilter();

        return retval;
    },

    getWhere: function() {
        let item = this.getActiveItem();
        let retval = '';

        if (item && item.getWhere)
            retval = item.getWhere();

        return retval;
    },

    forEachItem: function(func) {
        for (idx in this._items)
            func(this._items[idx]);
    },

    _getAllFilter: function() {
        let filters = [];

        this.forEachItem(function(item) {
            if (item.id != 'all')
                filters.push(item.getFilter());
        });

        return '(' + filters.join(' || ') + ')';
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

// GTK+ implementations

const BaseModelColumns = {
    ID: 0,
    NAME: 1,
    HEADING_TEXT: 2
};

function BaseModel(manager) {
    this._init(manager);
}

BaseModel.prototype = {
    _init: function(manager) {
        this.model = Gd.create_item_store();
        this._manager = manager;
        this._manager.connect('item-added', Lang.bind(this, this._refreshModel));
        this._manager.connect('item-removed', Lang.bind(this, this._refreshModel));

        this._refreshModel();
    },

    _refreshModel: function() {
        this.model.clear();

        let iter;
        let title = this._manager.getTitle();

        if (title) {
            iter = this.model.append();
            Gd.item_store_set(this.model, iter,
                              'heading', '', title);
        }

        let items = this._manager.getItems();
        for (idx in items) {
            let item = items[idx];
            iter = this.model.append();
            Gd.item_store_set(this.model, iter,
                              item.id, item.name, '');
        }
    }
};

function BaseView(manager) {
    this._init(manager);
}

BaseView.prototype = {
    _init: function(manager) {
        this._model = new BaseModel(manager);
        this._manager = manager;

        this.widget = new Gtk.TreeView({ headers_visible: false });
        this._treeView = this.widget;
        Gd.gtk_tree_view_set_activate_on_single_click(this._treeView, true);
        this._treeView.set_model(this._model.model);

        let selection = this._treeView.get_selection();
        selection.set_mode(Gtk.SelectionMode.NONE);

        this._treeView.connect('row-activated', Lang.bind(this,
            function(view, path) {
                let iter = this._model.model.get_iter(path)[1];
                let id = this._model.model.get_value(iter, BaseModelColumns.ID);

                this.emit('item-activated');
                this._manager.setActiveItemById(id);
            }));

        let col = new Gtk.TreeViewColumn();
        this._treeView.append_column(col);

        // headings
        this._rendererHeading = new Gtk.CellRendererText({ weight: Pango.Weight.BOLD,
                                                           weight_set: true });
        col.pack_start(this._rendererHeading, false);
        col.add_attribute(this._rendererHeading,
                          'text', BaseModelColumns.HEADING_TEXT);
        col.set_cell_data_func(this._rendererHeading,
            Lang.bind(this, this._visibilityForHeading, true));

        // radio selection
        this._rendererRadio = new Gtk.CellRendererToggle({ radio: true,
                                                           mode: Gtk.CellRendererMode.INERT });
        col.pack_start(this._rendererRadio, false);
        col.set_cell_data_func(this._rendererRadio,
            Lang.bind(this, this._visibilityForHeading, false,
                      Lang.bind(this,
                          function(col, cell, model, iter) {
                              let id = model.get_value(iter, BaseModelColumns.ID);
                              if (id == this._manager.getActiveItem().id)
                                  cell.active = true;
                              else
                                  cell.active = false;
                          })));

        // item name
        this._rendererText = new Gtk.CellRendererText();
        col.pack_start(this._rendererText, true);
        col.add_attribute(this._rendererText,
                          'text', BaseModelColumns.NAME);
        col.set_cell_data_func(this._rendererText,
            Lang.bind(this, this._visibilityForHeading, false));

        this.widget.show_all();
    },

    _visibilityForHeading: function(col, cell, model, iter, visible, additionalFunc) {
        let heading = model.get_value(iter, BaseModelColumns.HEADING_TEXT);

        if ((visible && heading.length) || (!visible && !heading.length))
            cell.visible = true;
        else
            cell.visible = false;

        if (additionalFunc)
            additionalFunc(col, cell, model, iter);
    }
};
Signals.addSignalMethods(BaseView.prototype);
