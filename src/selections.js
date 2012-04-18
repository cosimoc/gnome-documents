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

const EvView = imports.gi.EvinceView;
const Gd = imports.gi.Gd;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const Pango = imports.gi.Pango;
const _ = imports.gettext.gettext;

const Documents = imports.documents;
const Global = imports.global;
const Manager = imports.manager;
const Notifications = imports.notifications;
const Query = imports.query;
const Tweener = imports.util.tweener;
const Utils = imports.utils;

const Lang = imports.lang;
const Signals = imports.signals;

const _COLLECTION_PLACEHOLDER_ID = 'collection-placeholder';

// fetch all the collections a given item is part of
function FetchCollectionsJob(urn) {
    this._init(urn);
}

FetchCollectionsJob.prototype = {
    _init: function(urn) {
        this._urn = urn;
        this._collections = [];
    },

    run: function(callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildFetchCollectionsQuery(this._urn);
        Global.connectionQueue.add(query.sparql, null, Lang.bind(this,
            function(object, res) {
                let cursor = null;

                try {
                    cursor = object.query_finish(res);
                    cursor.next_async(null, Lang.bind(this, this._onCursorNext));
                } catch (e) {
                    log(e);
                    this._emitCallback();
                }
            }));
    },

    _onCursorNext: function(cursor, res) {
        let valid = false;

        try {
            valid = cursor.next_finish(res);
        } catch (e) {
            log(e);
        }

        if (!valid) {
            cursor.close();
            this._emitCallback();

            return;
        }

        let urn = cursor.get_string(0)[0];
        this._collections.push(urn);

        cursor.next_async(null, Lang.bind(this, this._onCursorNext));
    },

    _emitCallback: function() {
        if (this._callback)
            this._callback(this._collections);
    }
};

// fetch the state of every collection applicable to the selected items
const OrganizeCollectionState = {
    NORMAL: 0,
    ACTIVE: 1 << 0,
    INCONSISTENT: 1 << 1,
    HIDDEN: 1 << 2
};

function FetchCollectionStateForSelectionJob() {
    this._init();
}

FetchCollectionStateForSelectionJob.prototype = {
    _init: function() {
        this._collectionsForItems = {};
        this._runningJobs = 0;
    },

    run: function(callback) {
        this._callback = callback;

        let urns = Global.selectionController.getSelection();
        urns.forEach(Lang.bind(this,
            function(urn) {
                let job = new FetchCollectionsJob(urn);

                this._runningJobs++;
                job.run(Lang.bind(this, this._jobCollector, urn));
            }));
    },

    _jobCollector: function(collectionsForItem, urn) {
        this._collectionsForItems[urn] = collectionsForItem;

        this._runningJobs--;
        if (!this._runningJobs)
            this._emitCallback();
    },

    _emitCallback: function() {
        let collectionState = {};
        let collections = Global.collectionManager.getItems();

        // for all the registered collections...
        for (collIdx in collections) {
            let collection = collections[collIdx];

            let found = false;
            let notFound = false;
            let hidden = false;

            // if the only object we are fetching collection state for is a
            // collection itself, hide this if it's the same collection.
            if (Object.keys(this._collectionsForItems).length == 1) {
                let itemIdx = Object.keys(this._collectionsForItems)[0];
                let item = Global.documentManager.getItemById(itemIdx);

                if (item.id == collection.id)
                    hidden = true;
            }

            for (itemIdx in this._collectionsForItems) {
                let item = Global.documentManager.getItemById(itemIdx);
                let collectionsForItem = this._collectionsForItems[itemIdx];

                // if one of the selected items is part of this collection...
                if (collectionsForItem.indexOf(collIdx) != -1)
                    found = true;
                else
                    notFound = true;

                if ((item.resourceUrn != collection.resourceUrn) &&
                    (collection.identifier.indexOf(Query.LOCAL_COLLECTIONS_IDENTIFIER) == -1)) {
                    hidden = true;
                }
            }

            let state = OrganizeCollectionState.NORMAL;

            if (found && notFound)
                // if some items are part of this collection and some are not...
                state |= OrganizeCollectionState.INCONSISTENT;
            else if (found)
                // if all items are part of this collection...
                state |= OrganizeCollectionState.ACTIVE;

            if (hidden)
                state |= OrganizeCollectionState.HIDDEN;

            collectionState[collIdx] = state;
        }

        if (this._callback)
            this._callback(collectionState);
    }
};

// updates the mtime for the given resource to the current system time
function UpdateMtimeJob(urn) {
    this._init(urn);
}

UpdateMtimeJob.prototype = {
    _init: function(urn) {
        this._urn = urn;
    },

    run: function(callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildUpdateMtimeQuery(this._urn);
        Global.connectionQueue.update(query.sparql, null, Lang.bind(this,
            function(object, res) {
                try {
                    object.update_finish(res);
                } catch (e) {
                    log(e);
                }

                if (this._callback)
                    this._callback();
            }));
    }
};

// adds or removes the selected items to the given collection
function SetCollectionForSelectionJob(collectionUrn, setting) {
    this._init(collectionUrn, setting);
}

SetCollectionForSelectionJob.prototype = {
    _init: function(collectionUrn, setting) {
        this._collectionUrn = collectionUrn;
        this._setting = setting;
        this._runningJobs = 0;
    },

    run: function(callback) {
        this._callback = callback;

        let urns = Global.selectionController.getSelection();
        urns.forEach(Lang.bind(this,
            function(urn) {
                // never add a collection to itself!!
                if (urn == this._collectionUrn)
                    return;

                let query = Global.queryBuilder.buildSetCollectionQuery(urn,
                    this._collectionUrn, this._setting);
                this._runningJobs++;

                Global.connectionQueue.update(query.sparql, null, Lang.bind(this,
                    function(object, res) {
                        try {
                            object.update_finish(res);
                        } catch (e) {
                            log(e);
                        }

                        this._jobCollector();
                    }));
            }));
    },

    _jobCollector: function() {
        this._runningJobs--;

        if (this._runningJobs == 0) {
            let job = new UpdateMtimeJob(this._collectionUrn);
            job.run(Lang.bind(this,
                function() {

                    if (this._callback)
                        this._callback();
                }));
        }
    }
};

// creates an (empty) collection with the given name
function CreateCollectionJob(name) {
    this._init(name);
}

CreateCollectionJob.prototype = {
    _init: function(name) {
        this._name = name;
        this._createdUrn = null;
    },

    run: function(callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildCreateCollectionQuery(this._name);
        Global.connectionQueue.updateBlank(query.sparql, null, Lang.bind(this,
            function(object, res) {
                let variant = null;
                try {
                    variant = object.update_blank_finish(res); // variant is aaa{ss}
                } catch (e) {
                    log(e);
                }

                variant = variant.get_child_value(0); // variant is now aa{ss}
                variant = variant.get_child_value(0); // variant is now a{ss}
                variant = variant.get_child_value(0); // variant is now {ss}

                let key = variant.get_child_value(0).get_string()[0];
                let val = variant.get_child_value(1).get_string()[0];

                if (key == 'res')
                    this._createdUrn = val;

                if (this._callback)
                    this._callback(this._createdUrn);
            }));
    }
};

const OrganizeModelColumns = {
    ID: 0,
    NAME: 1,
    STATE: 2
};

function OrganizeCollectionModel() {
    this._init();
}

OrganizeCollectionModel.prototype = {
    _init: function() {
        this.model = Gd.create_organize_store();
        this._placeholderRef = null;

        this._collAddedId =
            Global.collectionManager.connect('item-added',
                                             Lang.bind(this, this._onCollectionAdded));
        this._collRemovedId =
            Global.collectionManager.connect('item-removed',
                                             Lang.bind(this, this._onCollectionRemoved));

        // populate the model
        let job = new FetchCollectionStateForSelectionJob();
        job.run(Lang.bind(this, this._onFetchCollectionStateForSelection));
    },

    _findCollectionIter: function(item) {
        let collPath = null;

        this.model.foreach(Lang.bind(this,
            function(model, path, iter) {
                let id = model.get_value(iter, OrganizeModelColumns.ID);

                if (item.id == id) {
                    collPath = path.copy();
                    return true;
                }

                return false;
            }));

        if (collPath)
            return this.model.get_iter(collPath)[1];

        return null;
    },

    _onFetchCollectionStateForSelection: function(collectionState) {
        this.removePlaceholder();

        for (idx in collectionState) {
            let item = Global.collectionManager.getItemById(idx);

            if ((collectionState[item.id] & OrganizeCollectionState.HIDDEN) != 0)
                continue;

            let iter = this._findCollectionIter(item);

            if (!iter)
                iter = this.model.append();

            Gd.organize_store_set(this.model, iter,
                                  item.id, item.name, collectionState[item.id]);
        }
    },

    _refreshState: function() {
        let job = new FetchCollectionStateForSelectionJob();
        job.run(Lang.bind(this, this._onFetchCollectionStateForSelection));
    },

    _onCollectionAdded: function(manager, itemAdded) {
        this._refreshState();
    },

    _onCollectionRemoved: function(manager, itemRemoved) {
        let iter = this._findCollectionIter(itemRemoved);

        if (iter)
            this.model.remove(iter);
    },

    refreshCollectionState: function() {
        this._refreshState();
    },

    addPlaceholder: function() {
        this.removePlaceholder();

        let iter = this.model.append();
        Gd.organize_store_set(this.model, iter,
                              _COLLECTION_PLACEHOLDER_ID, '', OrganizeCollectionState.ACTIVE);

        let placeholderPath = this.model.get_path(iter);
        if (placeholderPath != null)
            this._placeholderRef = Gtk.TreeRowReference.new(this.model, placeholderPath);

        return placeholderPath;
    },

    removePlaceholder: function() {
        // remove the placeholder if it's here
        if (this._placeholderRef) {
            let placeholderPath = this._placeholderRef.get_path();
            let placeholderIter = this.model.get_iter(placeholderPath)[1];

            if (placeholderIter)
                this.model.remove(placeholderIter);

            this._placeholderRef = null;
        }
    },

    forgetPlaceholder: function() {
        let path = this._placeholderRef.get_path();
        this._placeholderRef = null;

        return path;
    },

    destroy: function() {
        if (this._collAddedId != 0) {
            Global.collectionManager.disconnect(this._collAddedId);
            this._collAddedId = 0;
        }

        if (this._collRemovedId != 0) {
            Global.collectionManager.disconnect(this._collRemovedId);
            this._collRemovedId = 0;
        }
    }
};

function OrganizeCollectionView() {
    this._init();
}

OrganizeCollectionView.prototype = {
    _init: function() {
        this._model = new OrganizeCollectionModel();
        this.widget = new Gtk.TreeView({ headers_visible: false,
                                         vexpand: true,
                                         hexpand: true });
        this.widget.set_model(this._model.model);

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                this._model.destroy();
            }));

        this._viewCol = new Gtk.TreeViewColumn();
        this.widget.append_column(this._viewCol);

        // checkbox
        this._rendererCheck = new Gtk.CellRendererToggle();
        this._viewCol.pack_start(this._rendererCheck, false);
        this._viewCol.set_cell_data_func(this._rendererCheck,
                                         Lang.bind(this, this._checkCellFunc));
        this._rendererCheck.connect('toggled', Lang.bind(this, this._onCheckToggled));

        // item name
        this._rendererText = new Gtk.CellRendererText();
        this._viewCol.pack_start(this._rendererText, true);
        this._viewCol.add_attribute(this._rendererText,
                                    'text', OrganizeModelColumns.NAME);

        this._rendererDetail = new Gd.StyledTextRenderer({ xpad: 16 });
        this._rendererDetail.add_class('dim-label');
        this._viewCol.pack_start(this._rendererDetail, false);
        this._viewCol.set_cell_data_func(this._rendererDetail,
                                         Lang.bind(this, this._detailCellFunc));

        this._rendererText.connect('edited', Lang.bind(this, this._onTextEdited));
        this._rendererText.connect('editing-canceled', Lang.bind(this, this._onTextEditCanceled));

        this.widget.show();
    },

    _onCheckToggled: function(renderer, pathStr) {
        let path = Gtk.TreePath.new_from_string(pathStr);
        let iter = this._model.model.get_iter(path)[1];

        let collUrn = this._model.model.get_value(iter, OrganizeModelColumns.ID);
        let state = this._rendererCheck.get_active();

        let job = new SetCollectionForSelectionJob(collUrn, !state);
        job.run(Lang.bind(this,
            function() {
                this._model.refreshCollectionState();
            }));
    },

    _onNewCollectionCreated: function(createdUrn) {
        if (!createdUrn) {
            this._model.removePlaceholder();
            return;
        }

        let path = this._model.forgetPlaceholder();
        if (!path)
            return;

        let iter = this._model.model.get_iter(path)[1];
        this._model.model.set_value(iter, OrganizeModelColumns.ID, createdUrn);

        let job = new SetCollectionForSelectionJob(createdUrn, true);
        job.run(null);
    },

    _onTextEdited: function(cell, pathStr, newText) {
        cell.editable = false;

        if (!newText || newText == '') {
            // don't insert collections with empty names
            this._model.removePlaceholder();
            return;
        }

        // update the new name immediately
        let path = Gtk.TreePath.new_from_string(pathStr);
        let iter = this._model.model.get_iter(path)[1];
        this._model.model.set_value(iter, OrganizeModelColumns.NAME, newText);

        // actually create the new collection
        let job = new CreateCollectionJob(newText);
        job.run(Lang.bind(this, this._onNewCollectionCreated, path));
    },

    _onTextEditCanceled: function() {
        this._model.removePlaceholder();
    },

    _checkCellFunc: function(col, cell, model, iter) {
        let state = model.get_value(iter, OrganizeModelColumns.STATE);
        let id = model.get_value(iter, OrganizeModelColumns.ID);

        cell.active = (state & OrganizeCollectionState.ACTIVE);
        cell.inconsistent = (state & OrganizeCollectionState.INCONSISTENT);
        cell.visible = (id != _COLLECTION_PLACEHOLDER_ID);
    },

    _detailCellFunc: function(col, cell, model, iter) {
        let id = model.get_value(iter, OrganizeModelColumns.ID);
        let item = Global.collectionManager.getItemById(id);

        if (item && item.identifier.indexOf(Query.LOCAL_COLLECTIONS_IDENTIFIER) == -1) {
            cell.text = Global.sourceManager.getItemById(item.resourceUrn).name;
            cell.visible = true;
        } else {
            cell.text = '';
            cell.visible = false;
        }
    },

    addCollection: function() {
        let path = this._model.addPlaceholder();

        if (!path)
            return;

        this._rendererText.editable = true;
        this.widget.set_cursor_on_cell(path, this._viewCol, this._rendererText, true);
    }
};

const OrganizeCollectionDialogResponse = {
    ADD: 1
};

function OrganizeCollectionDialog(toplevel) {
    this._init(toplevel);
};

OrganizeCollectionDialog.prototype = {
    _init: function(toplevel) {
        this.widget = new Gtk.Dialog({ transient_for: toplevel,
                                       modal: true,
                                       destroy_with_parent: true,
                                       default_width: 400,
                                       default_height: 250 });

        this.widget.add_button('gtk-add', OrganizeCollectionDialogResponse.ADD);
        this.widget.add_button('gtk-ok', Gtk.ResponseType.OK);
        this.widget.set_default_response(Gtk.ResponseType.OK);

        let contentArea = this.widget.get_content_area();
        let sw = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN,
                                          margin_left: 5,
                                          margin_right: 5,
                                          margin_bottom: 3 });
        let collView = new OrganizeCollectionView();

        sw.add(collView.widget);
        contentArea.add(sw);

        this.widget.connect('response', Lang.bind(this,
            function(widget, response) {
                if (response == OrganizeCollectionDialogResponse.ADD)
                    collView.addCollection();
            }));

        this.widget.show_all();
    }
};

function SelectionController() {
    this._init();
};

SelectionController.prototype = {
    _init: function() {
        this._selection = [];
        this._selectionMode = false;

        Global.documentManager.connect('item-removed',
                                       Lang.bind(this, this._onDocumentRemoved));
    },

    _onDocumentRemoved: function(manager, item) {
        let changed = false;
        let filtered = this._selection.filter(Lang.bind(this,
            function(value, index) {
                if (item.id == value)
                    changed = true;

                return (item.id != value);
            }));

        if (changed) {
            this._selection = filtered;
            this.emit('selection-changed', this._selection);
        }
    },

    setSelection: function(selection) {
        if (this._isFrozen)
            return;

        if (!selection)
            this._selection = [];
        else
            this._selection = selection;

        this.emit('selection-changed', this._selection);
    },

    getSelection: function() {
        return this._selection;
    },

    freezeSelection: function(freeze) {
        if (freeze == this._isFrozen)
            return;

        this._isFrozen = freeze;
    },

    setSelectionMode: function(setting) {
        if (this._selectionMode == setting)
            return;

        this._selectionMode = setting;
        this.emit('selection-mode-changed', this._selectionMode);
    },

    getSelectionMode: function() {
        return this._selectionMode;
    }
};
Signals.addSignalMethods(SelectionController.prototype);

function SelectionToolbar() {
    this._init();
}

SelectionToolbar.prototype = {
    _init: function() {
        this._itemListeners = {};
        this._insideRefresh = false;

        this.widget = new Gtk.Toolbar({ show_arrow: false,
                                        icon_size: Gtk.IconSize.LARGE_TOOLBAR });

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            show_on_set_parent: false,
                                            opacity: 0 });
        let actorWidget = this.actor.get_widget();
        actorWidget.get_style_context().add_class('documents-osd');
        actorWidget.reset_style();

        this._leftBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this._leftGroup = new Gtk.ToolItem({ child: this._leftBox });
        this.widget.insert(this._leftGroup, -1);
        this._leftGroup.show_all();

        this._toolbarFavorite = new Gtk.ToggleButton({ child: new Gtk.Image ({ icon_name: 'emblem-favorite-symbolic',
                                                                               pixel_size: 32 })});
        this._leftBox.add(this._toolbarFavorite);
        this._toolbarFavorite.connect('clicked', Lang.bind(this, this._onToolbarFavorite));

        this._toolbarPrint = new Gtk.Button({ child: new Gtk.Image ({ icon_name: 'printer-symbolic',
                                                                      pixel_size: 32 })});
        this._leftBox.add(this._toolbarPrint);
        this._toolbarPrint.connect('clicked', Lang.bind(this, this._onToolbarPrint));

        this._separator = new Gtk.SeparatorToolItem({ draw: false,
                                                      visible: true });
        this._separator.set_expand(true);
        this.widget.insert(this._separator, -1);

        this._rightBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        this._rightGroup = new Gtk.ToolItem({ child: this._rightBox });
        this.widget.insert(this._rightGroup, -1);
        this._rightGroup.show_all();

        this._toolbarCollection = new Gtk.Button({ child: new Gtk.Image ({ icon_name: 'list-add-symbolic',
                                                                           pixel_size: 32 })});
        this._toolbarCollection.set_tooltip_text(_("Organize"));
        this._rightBox.add(this._toolbarCollection);
        this._toolbarCollection.connect('clicked', Lang.bind(this, this._onToolbarCollection));
        this._toolbarCollection.show_all();

        this._toolbarTrash = new Gtk.Button({ child: new Gtk.Image ({ icon_name: 'user-trash-symbolic',
                                                                      pixel_size: 32 })});
        this._toolbarTrash.set_tooltip_text(_("Delete"));
        this._rightBox.add(this._toolbarTrash);
        this._toolbarTrash.connect('clicked', Lang.bind(this, this._onToolbarTrash));

        this._toolbarOpen = new Gtk.Button({ child: new Gtk.Image ({ icon_name: 'document-open-symbolic',
                                                                     pixel_size: 32 })});
        this._rightBox.add(this._toolbarOpen);
        this._toolbarOpen.connect('clicked', Lang.bind(this, this._onToolbarOpen));

        this.widget.show();

        Global.selectionController.connect('selection-mode-changed',
                                           Lang.bind(this, this._onSelectionModeChanged));
        Global.selectionController.connect('selection-changed',
                                           Lang.bind(this, this._onSelectionChanged));
    },

    _onSelectionModeChanged: function(controller, mode) {
        if (mode)
            this._onSelectionChanged();
        else
            this._fadeOut();
    },

    _onSelectionChanged: function() {
        if (!Global.selectionController.getSelectionMode())
            return;

        let selection = Global.selectionController.getSelection();
        this._setItemListeners(selection);

        if (selection.length > 0) {
            this._setItemVisibility();
            this._fadeIn();
        } else {
            this._fadeOut();
        }
    },

    _setItemListeners: function(selection) {
        for (idx in this._itemListeners) {
            let doc = this._itemListeners[idx];
            doc.disconnect(idx);
            delete this._itemListeners[idx];
        }

        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                let id = doc.connect('info-updated', Lang.bind(this, this._setItemVisibility));
                this._itemListeners[id] = doc;
            }));
    },

    _setItemVisibility: function() {
        let apps = [];
        let favCount = 0;
        let showFavorite = true;
        let canTrash = true;
        let showPrint = false;

        this._insideRefresh = true;

        let selection = Global.selectionController.getSelection();
        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);

                if (doc.favorite)
                    favCount++;

                if ((doc.defaultAppName) &&
                    (apps.indexOf(doc.defaultAppName) == -1))
                    apps.push(doc.defaultAppName);

                if (!doc.canTrash())
                    canTrash = false;
            }));

        showFavorite &= ((favCount == 0) || (favCount == selection.length));

        if (selection.length == 1) {
            let urn = selection[0];
            if (!Global.collectionManager.getItemById(urn))
                showPrint = true;
        }

        if (showPrint)
            this._toolbarPrint.show_all();
        else
            this._toolbarPrint.hide();

        if (canTrash)
            this._toolbarTrash.show_all();
        else
            this._toolbarTrash.hide();

        let openLabel = null;
        if (apps.length == 1) {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open with %s").format(apps[0]);
        } else {
            // Translators: this is the Open action in a context menu
            openLabel = _("Open");
        }

        if (apps.length > 0) {
            this._toolbarOpen.set_tooltip_text(openLabel);
            this._toolbarOpen.show_all();
        }

        if (showFavorite) {
            let isFavorite = (favCount == selection.length);
            let favoriteLabel = '';

            if (isFavorite) {
                favoriteLabel = _("Remove from favorites");
                this._toolbarFavorite.set_active(true);
                this._toolbarFavorite.get_style_context().add_class('favorite');
            } else {
                favoriteLabel = _("Add to favorites");
                this._toolbarFavorite.set_active(false);
                this._toolbarFavorite.get_style_context().remove_class('favorite');
            }

            this._toolbarFavorite.reset_style();
            this._toolbarFavorite.set_tooltip_text(favoriteLabel);
            this._toolbarFavorite.show_all();
        } else {
            this._toolbarFavorite.hide();
        }

        this._insideRefresh = false;
    },

    _onToolbarCollection: function() {
        let toplevel = this.widget.get_toplevel();
        if (!toplevel.is_toplevel())
            return;

        let dialog = new OrganizeCollectionDialog(toplevel);
        this._fadeOut();

        dialog.widget.connect('response', Lang.bind(this,
            function(widget, response) {
                if (response == Gtk.ResponseType.OK) {
                    dialog.widget.destroy();
                    this._fadeIn();
                }
            }));
    },

    _onToolbarOpen: function(widget) {
        let selection = Global.selectionController.getSelection();

        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                doc.open(widget.get_screen(), Gtk.get_current_event_time());
            }));
    },

    _onToolbarFavorite: function(widget) {
        if (this._insideRefresh)
            return;

        let selection = Global.selectionController.getSelection();

        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                doc.setFavorite(!doc.favorite);
            }));
    },

    _onToolbarTrash: function(widget) {
        let selection = Global.selectionController.getSelection();

        selection.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                doc.trash();
            }));
    },

    _onToolbarPrint: function(widget) {
        let selection = Global.selectionController.getSelection();

        if (selection.length != 1)
            return;

        let doc = Global.documentManager.getItemById(selection[0]);
        doc.load(null, Lang.bind(this,
            function(doc, evDoc, error) {
                if (!evDoc) {
                    // TODO: handle error here!
                    return;
                }

                let printOp = EvView.PrintOperation.new(evDoc);
                let printNotification = new Notifications.PrintNotification(printOp, doc);

                let toplevel = this.widget.get_toplevel();
                printOp.run(toplevel);
            }));
    },

    _fadeIn: function() {
        if (this.actor.opacity != 0)
            return;

        this.actor.opacity = 0;
        this.actor.show();

        Tweener.addTween(this.actor,
            { opacity: 255,
              time: 0.30,
              transition: 'easeOutQuad' });
    },

    _fadeOut: function() {
        Tweener.addTween(this.actor,
            { opacity: 0,
              time: 0.30,
              transition: 'easeOutQuad',
              onComplete: function() {
                  this.actor.hide();
              },
              onCompleteScope: this });
    }
};
