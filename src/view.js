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
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Documents = imports.documents;
const Global = imports.global;
const TrackerUtils = imports.trackerUtils;
const WindowMode = imports.windowMode;
const Utils = imports.utils;

const LoadMoreButton = new Lang.Class({
    Name: 'LoadMoreButton',

    _init: function() {
        this._block = false;

        this._controller = Global.offsetController;
        this._controllerId =
            this._controller.connect('item-count-changed',
                                     Lang.bind(this, this._onItemCountChanged));

        this.widget = new Gtk.Button({ no_show_all: true });
        this.widget.get_style_context().add_class('documents-load-more');
        this.widget.connect('clicked', Lang.bind(this,
            function() {
                this._controller.increaseOffset();
            }));

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                this._controller.disconnect(this._controllerId);
            }));

        this._onItemCountChanged();
    },

    _onItemCountChanged: function() {
        let remainingDocs = this._controller.getRemainingDocs();
        let offsetStep = this._controller.getOffsetStep();

        if (remainingDocs <= 0 || this._block) {
            this.widget.hide();
            return;
        }

        if (remainingDocs > offsetStep)
            remainingDocs = offsetStep;

        this.widget.label = Gettext.ngettext("Load %d more document",
                                             "Load %d more documents",
                                             remainingDocs).format(remainingDocs);
        this.widget.show();
    },

    setBlock: function(block) {
        if (this._block == block)
            return;

        this._block = block;
        this._onItemCountChanged();
    }
});

const ContextMenu = new Lang.Class({
    Name: 'ContextMenu',

    _init: function(urns) {
        let favCount = 0;
        let apps = [];
        let docs = [];

        this.widget = new Gtk.Menu();
        let showFavorite = (Global.modeController.getWindowMode() != WindowMode.WindowMode.PREVIEW);

        urns.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                if (doc.favorite)
                    favCount++;

                if (apps.indexOf(doc.defaultAppName) == -1) {
                    apps.push(doc.defaultAppName);
                }

                docs.push(doc);
            }));

        showFavorite &= ((favCount == 0) || (favCount == urns.length));

        let openLabel = null;
        if (apps.length == 1) {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open with %s").format(apps[0]);
        } else {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open");
        }

        let openItem = new Gtk.MenuItem({ label: openLabel });
        openItem.show();
        this.widget.append(openItem);

        let favoriteItem = null;
        if (showFavorite) {
            let isFavorite = (favCount == urns.length);
            let favoriteLabel = (isFavorite) ? _("Remove from favorites") : _("Add to favorites");

            favoriteItem = new Gtk.MenuItem({ label: favoriteLabel });
            favoriteItem.show();
            this.widget.append(favoriteItem);
        }

        docs.forEach(Lang.bind(this,
            function(doc) {
                openItem.connect('activate', Lang.bind(this,
                    function(item) {
                        doc.open(item.get_screen(), Gtk.get_current_event_time());
                    }));

                if (favoriteItem) {
                    favoriteItem.connect('activate', Lang.bind(this,
                        function() {
                            doc.setFavorite(!doc.favorite);
                        }));
                }
            }));

        this.widget.show_all();
    }
});

const ViewModel = new Lang.Class({
    Name: 'ViewModel',

    _init: function() {
        this.model = Gtk.ListStore.new(
            [ GObject.TYPE_STRING,
              GObject.TYPE_STRING,
              GObject.TYPE_STRING,
              GObject.TYPE_STRING,
              GdkPixbuf.Pixbuf,
              GObject.TYPE_LONG,
              GObject.TYPE_BOOLEAN ]);
        this.model.set_sort_column_id(Gd.MainColumns.MTIME,
                                      Gtk.SortType.DESCENDING);

        Global.documentManager.connect('item-added',
            Lang.bind(this, this._onItemAdded));
        Global.documentManager.connect('item-removed',
            Lang.bind(this, this._onItemRemoved));
        Global.documentManager.connect('clear',
            Lang.bind(this, this._onClear));

        // populate with the intial items
        let items = Global.documentManager.getItems();
        for (let idx in items) {
            this._onItemAdded(null, items[idx]);
        }
    },

    _onClear: function() {
        this.model.clear();
    },

    _onItemAdded: function(source, doc) {
        let iter = this.model.append();
        this.model.set(iter,
            [ 0, 1, 2, 3, 4, 5 ],
            [ doc.id, doc.uri, doc.name,
              doc.author, doc.pixbuf, doc.mtime ]);

        let treePath = this.model.get_path(iter);
        let treeRowRef = Gtk.TreeRowReference.new(this.model, treePath);

        doc.connect('info-updated', Lang.bind(this,
            function() {
                let objectPath = treeRowRef.get_path();
                if (!objectPath)
                    return;

                let objectIter = this.model.get_iter(objectPath)[1];
                if (objectIter)
                    this.model.set(objectIter,
                        [ 0, 1, 2, 3, 4, 5 ],
                        [ doc.id, doc.uri, doc.name,
                          doc.author, doc.pixbuf, doc.mtime ]);
            }));
    },

    _onItemRemoved: function(source, doc) {
        this.model.foreach(Lang.bind(this,
            function(model, path, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);

                if (id == doc.id) {
                    this.model.remove(iter);
                    return true;
                }

                return false;
            }));
    }
});

const ViewContainer = new Lang.Class({
    Name: 'ViewContainer',

    _init: function() {
        this._adjustmentValueId = 0;
        this._adjustmentChangedId = 0;
        this._scrollbarVisibleId = 0;

        this._model = new ViewModel();

        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });
        this.view = new Gd.MainView();
        this.widget.add(this.view);

        this._loadMore = new LoadMoreButton();
        this.widget.add(this._loadMore.widget);

        this.widget.show_all();

        this.view.connect('item-activated',
                            Lang.bind(this, this._onItemActivated));
        this.view.connect('selection-mode-request',
                            Lang.bind(this, this._onSelectionModeRequest));
        this.view.connect('view-selection-changed',
                            Lang.bind(this, this._onViewSelectionChanged));

        // connect to settings change for list/grid view
        this._viewSettingsId =
            Global.settings.connect('changed::view-as',
                                    Lang.bind(this, this._updateTypeForSettings));
        this._updateTypeForSettings();

        // setup selection controller => view
        this._selectionModeId =
            Global.selectionController.connect('selection-mode-changed',
                                               Lang.bind(this, this._onSelectionModeChanged));
        this._onSelectionModeChanged();

        Global.modeController.connect('window-mode-changed',
                                      Lang.bind(this, this._onWindowModeChanged));
        this._onWindowModeChanged();

        this._queryId =
            Global.trackerController.connect('query-status-changed',
                                             Lang.bind(this, this._onQueryStatusChanged));
        // ensure the tracker controller is started
        Global.trackerController.start();

        // this will create the model if we're done querying
        this._onQueryStatusChanged();
    },

    _updateTypeForSettings: function() {
        let viewType = Global.settings.get_enum('view-as');
        this.view.set_view_type(viewType);

        if (viewType == Gd.MainViewType.LIST)
            this._addListRenderers();
    },

    _addListRenderers: function() {
        let listWidget = this.view.get_generic_view();

        let typeRenderer =
            new Gd.StyledTextRenderer({ xpad: 16 });
        typeRenderer.add_class('dim-label');
        listWidget.add_renderer(typeRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);
                let doc = Global.documentManager.getItemById(id);

                typeRenderer.text = doc.typeDescription;
            }));

        let whereRenderer =
            new Gd.StyledTextRenderer({ xpad: 16 });
        whereRenderer.add_class('dim-label');
        listWidget.add_renderer(whereRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);
                let doc = Global.documentManager.getItemById(id);

                whereRenderer.text = doc.sourceName;
            }));

        let dateRenderer =
            new Gtk.CellRendererText({ xpad: 32 });
        listWidget.add_renderer(dateRenderer, Lang.bind(this,
            function(col, cell, model, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);
                let doc = Global.documentManager.getItemById(id);
                let DAY = 86400000000;

                let now = GLib.DateTime.new_now_local();
                let mtime = GLib.DateTime.new_from_unix_local(doc.mtime);
                let difference = now.difference(mtime);
                let days = Math.floor(difference / DAY);
                let weeks = Math.floor(difference / (7 * DAY));
                let months = Math.floor(difference / (30 * DAY));
                let years = Math.floor(difference / (365 * DAY));

                if (difference < DAY) {
                    dateRenderer.text = mtime.format('%X');
                } else if (difference < 2 * DAY) {
                    dateRenderer.text = _("Yesterday");
                } else if (difference < 7 * DAY) {
                    dateRenderer.text = Gettext.ngettext("%d day ago",
                                                         "%d days ago",
                                                         days).format(days);
                } else if (difference < 14 * DAY) {
                    dateRenderer.text = _("Last week");
                } else if (difference < 28 * DAY) {
                    dateRenderer.text = Gettext.ngettext("%d week ago",
                                                         "%d weeks ago",
                                                         weeks).format(weeks);
                } else if (difference < 60 * DAY) {
                    dateRenderer.text = _("Last month");
                } else if (difference < 360 * DAY) {
                    dateRenderer.text = Gettext.ngettext("%d month ago",
                                                         "%d months ago",
                                                         months).format(months);
                } else if (difference < 730 * DAY) {
                    dateRenderer.text = _("Last year");
                } else {
                    dateRenderer.text = Gettext.ngettext("%d year ago",
                                                         "%d years ago",
                                                         years).format(years);
                }
            }));
    },

    _onSelectionModeRequest: function() {
        Global.selectionController.setSelectionMode(true);
    },

    _onItemActivated: function(widget, id, path) {
        Global.documentManager.setActiveItemById(id);
    },

    _onQueryStatusChanged: function() {
        let status = Global.trackerController.getQueryStatus();

        if (!status) {
            // setup a model if we're not querying
            this.view.set_model(this._model.model);

            // unfreeze selection
            Global.selectionController.freezeSelection(false);
            this._updateSelection();
        } else {
            // save the last selection
            Global.selectionController.freezeSelection(true);

            // if we're querying, clear the model from the view,
            // so that we don't uselessly refresh the rows
            this.view.set_model(null);
        }
    },

    _updateSelection: function() {
        let selected = Global.selectionController.getSelection();
        let newSelection = [];

        if (!selected.length)
            return;

        let generic = this.view.get_generic_view();
        let first = true;
        this._model.model.foreach(Lang.bind(this,
            function(model, path, iter) {
                let id = this._model.model.get_value(iter, Gd.MainColumns.ID);
                let idIndex = selected.indexOf(id);

                if (idIndex != -1) {
                    this._model.model.set_value(iter, Gd.MainColumns.SELECTED, true);
                    newSelection.push(id);

                    if (first) {
                        generic.scroll_to_path(path);
                        first = false;
                    }
                }

                if (newSelection.length == selected.length)
                    return true;

                return false;
            }));

        Global.selectionController.setSelection(newSelection);
    },

    _onSelectionModeChanged: function() {
        let selectionMode = Global.selectionController.getSelectionMode();
        this.view.set_selection_mode(selectionMode);
    },

    _onViewSelectionChanged: function() {
        // update the selection on the controller when the view signals a change
        let selectedURNs = Utils.getURNsFromPaths(this.view.get_selection(),
                                                  this._model.model);
        Global.selectionController.setSelection(selectedURNs);
    },

    _onWindowModeChanged: function() {
        let mode = Global.modeController.getWindowMode();
        if (mode == WindowMode.WindowMode.OVERVIEW)
            this._connectView();
        else
            this._disconnectView();
    },

    _connectView: function() {
        this._adjustmentValueId =
            this.view.vadjustment.connect('value-changed',
                                          Lang.bind(this, this._onScrolledWinChange));
        this._adjustmentChangedId =
            this.view.vadjustment.connect('changed',
                                          Lang.bind(this, this._onScrolledWinChange));
        this._scrollbarVisibleId =
            this.view.get_vscrollbar().connect('notify::visible',
                                               Lang.bind(this, this._onScrolledWinChange));
        this._onScrolledWinChange();
    },

    _onScrolledWinChange: function() {
        let vScrollbar = this.view.get_vscrollbar();
        let adjustment = this.view.vadjustment;
        let revealAreaHeight = 32;

        // if there's no vscrollbar, or if it's not visible, hide the button
        if (!vScrollbar ||
            !vScrollbar.get_visible()) {
            this._loadMore.setBlock(true);
            return;
        }

        let value = adjustment.value;
        let upper = adjustment.upper;
        let page_size = adjustment.page_size;

        let end = false;

        // special case this values which happen at construction
        if ((value == 0) && (upper == 1) && (page_size == 1))
            end = false;
        else
            end = !(value < (upper - page_size - revealAreaHeight));

        this._loadMore.setBlock(!end);
    },

    _disconnectView: function() {
        if (this._adjustmentValueId != 0) {
            this.view.vadjustment.disconnect(this._adjustmentValueId);
            this._adjustmentValueId = 0;
        }
        if (this._adjustmentChangedId != 0) {
            this.view.vadjustment.disconnect(this._adjustmentChangedId);
            this._adjustmentChangedId = 0;
        }
        if (this._scrollbarVisibleId != 0) {
            this.view.get_vscrollbar().disconnect(this._scrollbarVisibleId);
            this._scrollbarVisibleId = 0;
        }
    }
});
