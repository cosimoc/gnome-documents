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

const Clutter = imports.gi.Clutter;
const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const Pango = imports.gi.Pango;

const Gettext = imports.gettext;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Global = imports.global;
const Tweener = imports.util.tweener;
const WindowMode = imports.windowMode;

function MainToolbar() {
    this._init();
}

MainToolbar.prototype = {
    _init: function() {
        this._model = null;

        this._collectionId = 0;
        this._selectionChangedId = 0;

        this.widget = new Gd.MainToolbar({ icon_size: Gtk.IconSize.MENU });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_MENUBAR);
        this.widget.show();

        this.layout = new Clutter.BoxLayout({ vertical: true });
        this.actor = new Clutter.Actor({ layout_manager: this.layout });

        this.layout.pack(new GtkClutter.Actor({ contents: this.widget }),
                         false, true, false,
                         Clutter.BoxAlignment.CENTER, Clutter.BoxAlignment.START);

        // setup listeners to mode changes that affect the toolbar layout
        this._searchStringId =
            Global.searchController.connect('search-string-changed',
                                            Lang.bind(this, this._setToolbarTitle));
        this._searchTypeId =
            Global.searchTypeManager.connect('active-changed',
                                             Lang.bind(this, this._setToolbarTitle));
        this._searchMatchId =
            Global.searchMatchManager.connect('active-changed',
                                              Lang.bind(this, this._setToolbarTitle));
        this._searchSourceId =
            Global.sourceManager.connect('active-changed',
                                         Lang.bind(this, this._setToolbarTitle));
        this._selectionModeId =
            Global.selectionController.connect('selection-mode-changed',
                                               Lang.bind(this, this._onSelectionModeChanged));
        this._windowModeId =
            Global.modeController.connect('window-mode-changed',
                                          Lang.bind(this, this._onWindowModeChanged));
        this._onWindowModeChanged();

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                this._onToolbarClear();

                if (this._windowModeId != 0) {
                    Global.modeController.disconnect(this._windowModeId);
                    this._windowModeId = 0;
                }

                if (this._selectionModeId != 0) {
                    Global.selectionController.disconnect(this._selectionModeId);
                    this._selectionModeId = 0;
                }

                if (this._searchStringId != 0) {
                    Global.searchController.disconnect(this._searchStringId);
                    this._searchStringId = 0;
                }

                if (this._searchTypeId != 0) {
                    Global.searchTypeManager.disconnect(this._searchTypeId);
                    this._searchTypeId = 0;
                }

                if (this._searchMatchId != 0) {
                    Global.searchMatchManager.disconnect(this._searchMatchId);
                    this._searchMatchId = 0;
                }

                if (this._searchSourceId != 0) {
                    Global.sourceManager.disconnect(this._searchSourceId);
                    this._searchSourceId = 0;
                }
            }));

        // setup listeners from toolbar actions to window mode changes
        this.widget.connect('selection-mode-request', Lang.bind(this,
            function(toolbar, requestMode) {
                Global.selectionController.setSelectionMode(requestMode);
            }));

        this.widget.connect('go-back-request', Lang.bind(this,
            function(toolbar) {
                let mode = Global.modeController.getWindowMode();
                if (mode == WindowMode.WindowMode.PREVIEW)
                    Global.modeController.setWindowMode(WindowMode.WindowMode.OVERVIEW);
                else
                    Global.collectionManager.setActiveItem(null);
            }));

        this.widget.connect('clear-request', Lang.bind(this, this._onToolbarClear));
    },

    _onToolbarClear: function() {
        this._model = null;

        if (this._collectionId != 0) {
            Global.collectionManager.disconnect(this._collectionId);
            this._collectionId = 0;
        }

        if (this._selectionChangedId != 0) {
            Global.selectionController.disconnect(this._selectionChangedId);
            this._selectionChangedId = 0;
        }
    },

    _populateForSelectionMode: function() {
        this.widget.set_mode(Gd.MainToolbarMode.SELECTION);

        // connect to selection changes while in this mode
        this._selectionChangedId =
            Global.selectionController.connect('selection-changed',
                                               Lang.bind(this, this._setToolbarTitle));
        this._setToolbarTitle();

        this.widget.show_all();
    },

    _populateForOverview: function() {
        this.widget.set_mode(Gd.MainToolbarMode.OVERVIEW);

        // connect to active collection changes while in this mode
        this._collectionId =
            Global.collectionManager.connect('active-changed',
                                             Lang.bind(this, this._onActiveCollectionChanged));
        this._onActiveCollectionChanged();

        this.widget.show_all();
    },

    _onActiveCollectionChanged: function() {
        let item = Global.collectionManager.getActiveItem();
        this.widget.set_back_visible(item != null);

        this._setToolbarTitle();
    },

    _setToolbarTitle: function() {
        let mode = this.widget.get_mode();
        let activeCollection = Global.collectionManager.getActiveItem();
        let primary = null;
        let detail = null;

        if (mode == Gd.MainToolbarMode.OVERVIEW) {
            if (activeCollection) {
                primary = activeCollection.name;
            } else {
                let string = Global.searchController.getString();

                if (string == '') {
                    let searchType = Global.searchTypeManager.getActiveItem();
                    let searchSource = Global.sourceManager.getActiveItem();

                    if (searchType.id != 'all')
                        primary = searchType.name;
                    else
                        primary = _("New and Recent");

                    if (searchSource.id != 'all')
                        detail = searchSource.name;
                } else {
                    let searchMatch = Global.searchMatchManager.getActiveItem();

                    primary = _("Results for \"%s\"").format(string);
                    if (searchMatch.id == 'title')
                        detail = _("filtered by title");
                    else if (searchMatch.id == 'author')
                        detail = _("filtered by author");
                }
            }
        } else if (mode == Gd.MainToolbarMode.PREVIEW) {
            let doc = Global.documentManager.getActiveItem();
            primary = doc.name;

            if (this._model) {
                let curPage, totPages;

                curPage = this._model.get_page();
                totPages = this._model.get_document().get_n_pages();

                detail = _("%d of %d").format(curPage + 1, totPages);
            }
        } else if (mode == Gd.MainToolbarMode.SELECTION) {
            let length = Global.selectionController.getSelection().length;

            if (length == 0)
                detail = _("Click on items to select them");
            else
                detail = Gettext.ngettext("%d selected",
                                          "%d selected",
                                          length).format(length);

            if (activeCollection) {
                primary = activeCollection.name;
            } else if (length != 0) {
                primary = detail;
                detail = null;
            }
        }

        if (detail)
            detail = '(' + detail + ')';

        this.widget.set_labels(primary, detail);
    },

    _populateForPreview: function(model) {
        this.widget.set_mode(Gd.MainToolbarMode.PREVIEW);
        this._setToolbarTitle();

        this.widget.show_all();
    },

    _onWindowModeChanged: function() {
        let mode = Global.modeController.getWindowMode();

        if (mode == WindowMode.WindowMode.OVERVIEW)
            this._populateForOverview();
        else if (mode == WindowMode.WindowMode.PREVIEW)
            this._populateForPreview();
    },

    _onSelectionModeChanged: function() {
        if (Global.modeController.getWindowMode() != WindowMode.WindowMode.OVERVIEW)
            return;

        let mode = Global.selectionController.getSelectionMode();

        if (mode)
            this._populateForSelectionMode();
        else
            this._populateForOverview();
    },

    setModel: function(model) {
        if (!model)
            return;

        this._model = model;
        this._model.connect('page-changed', Lang.bind(this,
            function() {
                this._setToolbarTitle();
            }));

        this._setToolbarTitle();
    }
};

function FullscreenToolbar() {
    this._init();
};

FullscreenToolbar.prototype = {
    __proto__: MainToolbar.prototype,

    _init: function() {
        MainToolbar.prototype._init.call(this);

        this.actor.y = -(this.widget.get_preferred_height()[1]);
    },

    show: function() {
        Tweener.addTween(this.actor,
                         { y: 0,
                           time: 0.20,
                           transition: 'easeInQuad' });
    },

    hide: function() {
        Tweener.addTween(this.actor,
                         { y: -(this.widget.get_preferred_height()[1]),
                           time: 0.20,
                           transition: 'easeOutQuad' });
    }
};
