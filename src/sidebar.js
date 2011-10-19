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
const Goa = imports.gi.Goa;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Signals = imports.signals;

const Global = imports.global;
const Sources = imports.sources;
const WindowMode = imports.windowMode;

const _SIDEBAR_WIDTH_REQUEST = 240;

const _SIDEBAR_SOURCES_PAGE = 0;
const _SIDEBAR_MAIN_PAGE = 1;

const SidebarModelColumns = {
    ID: 0,
    NAME: 1,
    ICON: 2,
    HEADING_TEXT: 3,
    SECTION: 4
};

const SidebarModelSections = {
    CATEGORIES: 0,
    COLLECTIONS: 1
};

function SidebarModel() {
    this._init();
};

SidebarModel.prototype = {
    _init: function() {
        this._collHeaderRef = null;

        this.model = Gd.create_sidebar_store();
        this.model.set_sort_column_id(0, Gtk.SortType.ASCENDING);
        this.model.set_sort_func(0, Lang.bind(this, this._modelSortFunc));

        // track collections additions and removals;
        // categories are static right now, so there's no need to track
        // additions/removal for them.
        Global.collectionManager.connect('item-added',
                                         Lang.bind(this, this._addCollection));
        Global.collectionManager.connect('item-removed',
                                         Lang.bind(this, this._removeCollection));

        let iter = null;

        // insert collections
        let items = Global.collectionManager.getItems();
        for (idx in items) {
            let collection = items[idx];
            this._addCollection(null, collection);
        }

        // insert categories
        items = Global.categoryManager.getItems();
        for (idx in items) {
            let category = items[idx];
            iter = this.model.append();
            Gd.sidebar_store_set(this.model, iter,
                                 category.id, category.name, category.icon,
                                 '', SidebarModelSections.CATEGORIES);
        };
    },

    _checkHeader: function() {
        let shouldShow = (Global.collectionManager.getItemsCount() > 0);

        // if the header is already in the desired state, just return
        if ((this._collHeaderRef && shouldShow) ||
            (!this._collHeaderRef && !shouldShow))
            return;

        if (shouldShow) {
            // save this as a tree reference to remove it later
            let iter = this.model.append();
            let path = this.model.get_path(iter);
            this._collHeaderRef = Gtk.TreeRowReference.new(this.model, path);

            Gd.sidebar_store_set(this.model, iter,
                                 'collections-header-placeholder', '', '',
                                 _('Collections'), SidebarModelSections.COLLECTIONS);
        } else {
            let path = this._collHeaderRef.get_path();
            let iter = this.model.get_iter(path);

            if (iter[0]) {
                this.model.remove(iter[1]);
                this._collHeaderRef = null;
            }
        }
    },

    _addCollection: function(controller, collection) {
        // just append here; the sort function will move the new
        // row to the right position
        let iter = this.model.append();
        Gd.sidebar_store_set(this.model, iter,
                             collection.id, collection.name, collection.icon,
                             '', SidebarModelSections.COLLECTIONS);

        this._checkHeader();
    },

    _removeCollection: function(controller, collection) {
        // go through the model rows until we found our collection
        this.model.foreach(Lang.bind(this,
            function(model, path, iter) {
                let id = this.model.get_value(iter, SidebarModelColumns.ID);
                if (id == collection.id) {
                    this.model.remove(iter);
                    this._checkHeader();

                    return true;
                }

                return false;
            }));
    },

    // returns:
    // * 0 if iters are equal
    // * < 0 if A sorts before B
    // * > 0 if A sorts after B
    _modelSortFunc: function(model, iterA, iterB) {
        let sectionA, sectionB;

        sectionA = this.model.get_value(iterA, SidebarModelColumns.SECTION);
        sectionB = this.model.get_value(iterB, SidebarModelColumns.SECTION);

        let diff = sectionA - sectionB;
        if (diff != 0)
            return diff;

        // they're in the same section, so prefer headings
        let headingA, headingB;

        headingA = this.model.get_value(iterA, SidebarModelColumns.HEADING_TEXT);
        headingB = this.model.get_value(iterB, SidebarModelColumns.HEADING_TEXT);

        if (headingA.length)
            return -1;
        else if (headingB.length)
            return 1;

        return 0;
    }
};

function SidebarView() {
    this._init();
};

SidebarView.prototype = {
    _init: function() {
        this._model = new SidebarModel();
        this._treeModel = this._model.model;

        this._treeView = new Gtk.TreeView({ headers_visible: false,
                                            vexpand: true });
        Gd.gtk_tree_view_set_activate_on_single_click(this._treeView, true);
        this._treeView.set_model(this._treeModel);

        let selection = this._treeView.get_selection();
        selection.set_select_function(Lang.bind(this, this._treeSelectionFunc));

        this.widget = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER });
        this.widget.add(this._treeView);

        this._treeView.connect('row-activated', Lang.bind(this,
            function(view, path) {
                let iter = this._treeModel.get_iter(path)[1];
                let id = this._treeModel.get_value(iter, SidebarModelColumns.ID);
                let section = this._treeModel.get_value(iter, SidebarModelColumns.SECTION);

                let controller = null;
                if (section == SidebarModelSections.CATEGORIES)
                    controller = Global.categoryManager;
                else if (section == SidebarModelSections.COLLECTIONS)
                    controller = Global.collectionManager;

                let item = controller.getItemById(id);
                Global.sideFilterController.setActiveItem(controller, item);
            }));

        let col = new Gtk.TreeViewColumn();
        this._treeView.append_column(col);

        // heading
        this._rendererHeading = new Gtk.CellRendererText({ xpad: 10,
                                                           weight: Pango.Weight.BOLD,
                                                           weight_set: true });
        col.pack_start(this._rendererHeading, false);
        col.add_attribute(this._rendererHeading,
                          'text', SidebarModelColumns.HEADING_TEXT);
        col.set_cell_data_func(this._rendererHeading,
                               Lang.bind(this, this._headingDataFunc));

        // icon
        this._rendererIcon = new Gtk.CellRendererPixbuf({ xpad: 10 });
        col.pack_start(this._rendererIcon, false);
        col.add_attribute(this._rendererIcon,
                          'icon-name', SidebarModelColumns.ICON);
        col.set_cell_data_func(this._rendererIcon,
                               Lang.bind(this, this._bgDataFunc));

        // name
        this._rendererText = new Gtk.CellRendererText({ ellipsize: Pango.EllipsizeMode.END });
        col.pack_start(this._rendererText, true);
        col.add_attribute(this._rendererText,
                          'text', SidebarModelColumns.NAME);
        col.set_cell_data_func(this._rendererText,
                               Lang.bind(this, this._textDataFunc));

        this.widget.show_all();
    },

    _treeSelectionFunc: function(selection, model, path, selected) {
        let iter = model.get_iter(path);
        if (!iter[0])
            return false;

        iter = iter[1];

        let heading = model.get_value(iter, SidebarModelColumns.HEADING_TEXT);
        if (heading.length)
            return false;

        return true;
    },

    _headingDataFunc: function(col, renderer, model, iter) {
        let heading = model.get_value(iter, SidebarModelColumns.HEADING_TEXT);

        // if there's no heading set, make this renderer invisible,
        // and unset its custom foreground color
        if (!heading.length) {
            renderer.visible = false;
            renderer.foreground_set = false;

            return;
        }

        // make this visible
        renderer.visible = true;

        // use a lighter text for the heading text
        let context = this._treeView.get_style_context();
        let fgColor = context.get_color(Gtk.StateFlags.NORMAL);
        let symbolicColor = Gtk.SymbolicColor.new_literal(fgColor);
        let shade = symbolicColor.new_shade(1.50);

        [ res, fgColor ] = shade.resolve(null);

        if (res) {
            renderer.foreground_rgba = fgColor;
            renderer.foreground_set = true;
        } else {
            renderer.foreground_set = false;
        }
    },

    _textDataFunc: function(col, renderer, model, iter) {
        // if there's no text to show, hide the renderer
        let text = model.get_value(iter, SidebarModelColumns.NAME);
        if (!text.length) {
            renderer.visible = false;
            renderer.foreground_set = false;
            return;
        }

        // make this visible
        renderer.visible = true;

        // render the background according to the current section
        this._bgDataFunc(col, renderer, model, iter);

        // we want to change the fg color for the text in the categories
        // section
        let section = model.get_value(iter, SidebarModelColumns.SECTION);
        if (section != SidebarModelSections.CATEGORIES) {
            renderer.foreground_set = false;
            return;
        }

        // use a darker text for the category names
        let context = this._treeView.get_style_context();
        let fgColor = context.get_color(Gtk.StateFlags.NORMAL);
        let symbolicColor = Gtk.SymbolicColor.new_literal(fgColor);
        let shade = symbolicColor.new_shade(0.60);

        [ res, fgColor ] = shade.resolve(null);

        if (res) {
            renderer.foreground_rgba = fgColor;
            renderer.foreground_set = true;
        } else {
            renderer.foreground_set = false;
        }
    },

    _bgDataFunc: function(col, renderer, model, iter) {
        let section = model.get_value(iter, SidebarModelColumns.SECTION);
        let heading = model.get_value(iter, SidebarModelColumns.HEADING_TEXT);

        // we want to change the background color for the collections
        // section, but not for its heading
        if (section != SidebarModelSections.COLLECTIONS ||
            heading.length) {
            renderer.cell_background_set = false;
            return;
        }

        // shade the bg color to be darker
        let context = this._treeView.get_style_context();
        let bgColor = context.get_background_color(Gtk.StateFlags.NORMAL);
        let symbolicColor = Gtk.SymbolicColor.new_literal(bgColor);
        let shade = symbolicColor.new_shade(0.95);

        [ res, bgColor ] = shade.resolve(null);

        if (res) {
            renderer.cell_background_rgba = bgColor;
            renderer.cell_background_set = true;
        } else {
            renderer.cell_background_set = false;
        }
    }
};

function SidebarMainPage() {
    this._init();
};

SidebarMainPage.prototype = {
    _init: function() {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     width_request: _SIDEBAR_WIDTH_REQUEST,
                                     column_homogeneous: true,
                                     row_spacing: 12 });

        // sources button
        let buttonContent = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                           column_spacing: 6 });
        // FIXME: setting yalign here seems wrong, but why are those not aligned
        // otherwise?
        buttonContent.add(new Gtk.Image({ icon_size: Gtk.IconSize.MENU,
                                          icon_name: 'go-previous-symbolic',
                                          yalign: 0.75 }));
        this._buttonLabel = new Gtk.Label({ label: _("Sources") });
        buttonContent.add(this._buttonLabel);

        this._sourcesButton = new Gtk.Button({ child: buttonContent,
                                               border_width: 6 });
        this.widget.add(this._sourcesButton);
        this._sourcesButton.connect('clicked', Lang.bind(this, this._onSourcesButtonClicked));

        // actual view
        this._sidebarView = new SidebarView();
        this.widget.add(this._sidebarView.widget);

        this.widget.show_all();
    },

    _onSourcesButtonClicked: function() {
        this.emit('sources-button-clicked');
    }
};
Signals.addSignalMethods(SidebarMainPage.prototype);

function Sidebar() {
    this._init();
}

Sidebar.prototype = {
    _init: function() {
        this.widget = new Gtk.Notebook({ show_tabs: false });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_SIDEBAR);

        this._sourceView = new Sources.SourceView();
        this.widget.insert_page(this._sourceView.widget, null, _SIDEBAR_SOURCES_PAGE);
        this._sourceView.connect('source-clicked',
                                 Lang.bind(this, this._onSourceClicked));

        this._sidebarView = new SidebarMainPage();
        this.widget.insert_page(this._sidebarView.widget, null, _SIDEBAR_MAIN_PAGE);
        this._sidebarView.connect('sources-button-clicked',
                                  Lang.bind(this, this._onSourcesButtonClicked));

        this.widget.set_current_page(_SIDEBAR_MAIN_PAGE);

        Global.modeController.connect('window-mode-changed',
                                      Lang.bind(this, this._onWindowModeChanged));
    },

    _onSourceClicked: function() {
        this.widget.set_current_page(_SIDEBAR_MAIN_PAGE);
    },

    _onSourcesButtonClicked: function() {
        this.widget.set_current_page(_SIDEBAR_SOURCES_PAGE);
    },

    _onWindowModeChanged: function(controller, mode) {
        this.widget.set_visible(mode == WindowMode.WindowMode.OVERVIEW);
    }
};
